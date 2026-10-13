"""Meeting intelligence with Gemini: live analysis, final summary and Q&A."""
import logging

import config
from schemas import MeetingAnalysis

log = logging.getLogger("meeting-ai")

_client = None


class GeminiNotConfigured(RuntimeError):
    pass


# ---------- Instructions given to Gemini ----------

ANALYSIS_INSTRUCTIONS = """
You analyze a meeting while it is happening. You receive background context and the discussion so far.

Rules:
- The background context is NOT part of the discussion. Never report something as decided or discussed
  only because it appears in the background.
- Use only what people actually said. Never invent names, tasks or deadlines.
- A decision is a clear choice the group agreed on. Suggestions, opinions and open discussion are NOT decisions.
- An action item is a task given to, or accepted by, someone. "owner" is the responsible person and
  "deadline" is what was said (for example "Friday"). Use null when it was not said.
- A question is a real, important question raised in the meeting. Write it as a clear question.
- "topics" are short phrases. "current_topic" is the subject discussed most recently.
- Answer in the language of the discussion. Keep every item short and self-contained.
- Always return the complete, up-to-date lists for the whole discussion, not only the new items.
""".strip()

SUMMARY_INSTRUCTIONS = """
Write a short summary (3 to 5 sentences) of this meeting for someone who missed it.
Use only the discussion. Mention the decisions and who is responsible for what.
Plain text only: no headings, no bullet points. Use the language of the discussion.
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

    options = {"system_instruction": instructions}
    if schema is not None:
        options["response_mime_type"] = "application/json"
        options["response_schema"] = schema

    return _get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(**options),
    )


# ---------- Public functions ----------

def analyze_meeting(context: str, transcript: list[dict]) -> MeetingAnalysis:
    """Structured analysis of everything said so far."""
    if not transcript:
        return MeetingAnalysis.empty()

    prompt = (
        f"<background_context>\n{context or 'None'}\n</background_context>\n\n"
        f"<discussion>\n{_format_transcript(transcript)}\n</discussion>"
    )
    response = _generate(prompt, ANALYSIS_INSTRUCTIONS, schema=MeetingAnalysis)
    return response.parsed or MeetingAnalysis.model_validate_json(response.text)


def summarize_meeting(context: str, transcript: list[dict], analysis: MeetingAnalysis) -> str:
    if not transcript:
        return "No discussion was captured."

    prompt = (
        f"<background_context>\n{context or 'None'}\n</background_context>\n\n"
        f"<discussion>\n{_format_transcript(transcript)}\n</discussion>\n\n"
        f"<extracted>\n{analysis.model_dump_json(indent=2)}\n</extracted>"
    )
    return _generate(prompt, SUMMARY_INSTRUCTIONS).text.strip()


def answer_question(transcript: list[dict], extracted: dict, question: str) -> str:
    if not transcript:
        return "This was not discussed in the meeting."

    prompt = (
        f"<transcript>\n{_format_transcript(transcript)}\n</transcript>\n\n"
        f"<extracted>\n{extracted}\n</extracted>\n\n"
        f"<question>\n{question}\n</question>"
    )
    return _generate(prompt, QA_INSTRUCTIONS).text.strip()