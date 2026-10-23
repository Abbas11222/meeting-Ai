"""Meeting intelligence with Gemini.

Gemini is used in two places only:
  1. analyze_final()    once, when the meeting ends: structured output + summary in ONE request
  2. answer_question()  when someone asks a question about a finished meeting
"""
import logging

import config
from schemas import FinalAnalysis, MeetingAnalysis

log = logging.getLogger("meeting-ai")

_client = None


class GeminiNotConfigured(RuntimeError):
    pass


# ---------- Instructions given to Gemini ----------

FINAL_INSTRUCTIONS = """
You analyze a finished meeting. You receive background context and the full discussion.

Rules:
- The background context is NOT part of the discussion. Never report something as decided or discussed
  only because it appears in the background.
- Use only what people actually said. Never invent names, tasks or deadlines.
- A decision is a clear choice the group agreed on. Suggestions, opinions and open discussion are NOT decisions.
- An action item is a task given to, or accepted by, someone. "owner" is the responsible person and
  "deadline" is what was said (for example "Friday"). Use null when it was not said.
- A question is a real, important question raised in the meeting. Write it as a clear question.
- "topics" are the main subjects, as short phrases.
- "summary": 3 to 5 sentences for someone who missed the meeting. Mention the decisions and who is
  responsible for what. Plain text only: no headings, no bullet points.
- Answer in the language of the discussion. Keep every item short and self-contained.
- The speech-to-text may contain small mistakes. Use the context to understand the intended words.
""".strip()

QA_INSTRUCTIONS = """
Answer the question using only the meeting transcript and the extracted information.
If the answer is not in the meeting, reply exactly: This was not discussed in the meeting.
Keep the answer short. Use the language of the question.
""".strip()


# ---------- Helpers ----------

def is_configured() -> bool:
    return bool(config.GEMINI_API_KEY)


def _get_client():
    global _client
    if not is_configured():
        raise GeminiNotConfigured("GEMINI_API_KEY is missing. Add it to backend/.env")
    if _client is None:
        from google import genai                      # imported here so the server starts fast
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _format_transcript(transcript: list[dict]) -> str:
    return "\n".join(f"{line['speaker']}: {line['text']}" for line in transcript)


def _generate(contents: str, instructions: str, schema=None) -> object:
    from google.genai import types

    http_options = {"timeout": config.GEMINI_TIMEOUT_SECONDS * 1000}          # milliseconds
    if hasattr(types, "HttpRetryOptions"):
        http_options["retry_options"] = types.HttpRetryOptions(attempts=2)   # one retry, not many

    options = {
        "system_instruction": instructions,
        "http_options": types.HttpOptions(**http_options),
    }
    if schema is not None:
        options["response_mime_type"] = "application/json"
        options["response_schema"] = schema

    return _get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(**options),
    )


# ---------- Errors ----------

def is_quota_error(error: Exception) -> bool:
    return getattr(error, "code", None) == 429 or "RESOURCE_EXHAUSTED" in str(error)


def describe_error(error: Exception) -> str:
    """A short message that is safe to show to the user."""
    if isinstance(error, GeminiNotConfigured):
        return "The Gemini key is missing. Add GEMINI_API_KEY to the .env file."
    if is_quota_error(error):
        return "The Gemini free quota is used up. Try again later, or use another key or model."
    return "Gemini could not process this request. See the server log for details."


# ---------- Public functions ----------

def analyze_final(context: str, transcript: list[dict]) -> FinalAnalysis:
    """Structured analysis and summary of the whole meeting, in ONE request."""
    if not transcript:
        return FinalAnalysis(**MeetingAnalysis.empty().model_dump(), summary="No discussion was captured.")

    prompt = (
        f"<background_context>\n{context or 'None'}\n</background_context>\n\n"
        f"<discussion>\n{_format_transcript(transcript)}\n</discussion>"
    )
    response = _generate(prompt, FINAL_INSTRUCTIONS, schema=FinalAnalysis)
    return response.parsed or FinalAnalysis.model_validate_json(response.text)


def answer_question(transcript: list[dict], extracted: dict, question: str) -> str:
    if not transcript:
        return "This was not discussed in the meeting."

    prompt = (
        f"<transcript>\n{_format_transcript(transcript)}\n</transcript>\n\n"
        f"<extracted>\n{extracted}\n</extracted>\n\n"
        f"<question>\n{question}\n</question>"
    )
    return _generate(prompt, QA_INSTRUCTIONS).text.strip()
