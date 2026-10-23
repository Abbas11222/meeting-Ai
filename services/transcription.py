"""Speech-to-text with Whisper Large-v3 Turbo.

Engines, chosen with STT_ENGINE in .env:
  groq     Groq's hosted Whisper (fast, nothing to download, needs GROQ_API_KEY)
  local    faster-whisper running on this computer (needs the faster-whisper package)
  browser  no server speech-to-text: the page uses Chrome's built-in recognition

If the server engine is not set up or fails, the web page switches to Chrome's recognition.
Groq is called through its web API with httpx, so no separate "groq" package is needed.
"""
import logging
import os
import re
import tempfile
import threading

import httpx

import config

log = logging.getLogger("meeting-ai")

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """Returns the spoken text of one audio part. Returns '' for silence."""
    if config.STT_ENGINE == "browser":
        raise RuntimeError("Server speech-to-text is switched off (STT_ENGINE=browser).")

    if config.STT_ENGINE == "local":
        text = _transcribe_local(audio_bytes, suffix)
    else:
        text = _transcribe_groq(audio_bytes, suffix)

    # Whisper sometimes returns only punctuation (".") for silence. That is not speech.
    return text if re.search(r"\w", text) else ""


def is_configured() -> bool:
    """True when the server can transcribe speech. If False, the page uses Chrome instead."""
    if config.STT_ENGINE == "browser":
        return False
    if config.STT_ENGINE == "local":
        return True
    return bool(config.GROQ_API_KEY)


# ---------- Groq (hosted) ----------

def _transcribe_groq(audio_bytes: bytes, suffix: str) -> str:
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is missing. Add it to backend/.env")

    form = {"model": config.GROQ_STT_MODEL, "response_format": "verbose_json", "temperature": "0"}
    if config.WHISPER_LANGUAGE:
        form["language"] = config.WHISPER_LANGUAGE

    response = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        data=form,
        files={"file": (f"chunk{suffix}", audio_bytes, "audio/webm")},
        timeout=30,
    )
    response.raise_for_status()
    result = response.json()

    segments = result.get("segments")
    if segments is None:
        return result.get("text", "").strip()

    # Whisper sometimes invents words (like "Thank you.") for silence.
    # Drop segments that the model itself marks as probably not speech.
    spoken = [
        segment["text"].strip()
        for segment in segments
        if not (segment.get("no_speech_prob", 0) > 0.6 and segment.get("avg_logprob", 0) < -1.0)
    ]
    return " ".join(spoken).strip()


# ---------- Local (faster-whisper) ----------

_model = None
_model_lock = threading.Lock()      # protects loading the model
_run_lock = threading.Lock()        # runs one transcription at a time


def load_model():
    """Loads the local model once. The first call downloads it (about 1.5 GB)."""
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel   # imported here so the server starts fast

            log.info("Loading local Whisper model '%s' ...", config.WHISPER_MODEL)
            _model = WhisperModel(
                config.WHISPER_MODEL,
                device=config.WHISPER_DEVICE,
                compute_type=config.WHISPER_COMPUTE_TYPE,
            )
            log.info("Whisper model ready.")
    return _model


def _transcribe_local(audio_bytes: bytes, suffix: str) -> str:
    model = load_model()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as file:
        file.write(audio_bytes)
        path = file.name

    try:
        with _run_lock:
            segments, _info = model.transcribe(
                path, vad_filter=True, language=config.WHISPER_LANGUAGE or None
            )
            return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        os.unlink(path)