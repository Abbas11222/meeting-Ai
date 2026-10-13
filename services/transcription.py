"""Speech-to-text with Whisper Large-v3 Turbo (through the faster-whisper package)."""
import logging
import os
import tempfile
import threading

import config

log = logging.getLogger("meeting-ai")

_model = None
_model_lock = threading.Lock()      # protects loading the model
_run_lock = threading.Lock()        # runs one transcription at a time


def load_model():
    """Loads the model once. The first call downloads it (about 1.5 GB)."""
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel   # imported here so the server starts fast

            log.info("Loading Whisper model '%s' ...", config.WHISPER_MODEL)
            _model = WhisperModel(
                config.WHISPER_MODEL,
                device=config.WHISPER_DEVICE,
                compute_type=config.WHISPER_COMPUTE_TYPE,
            )
            log.info("Whisper model ready.")
    return _model


def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """Returns the spoken text of one audio part. Returns '' for silence."""
    model = load_model()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as file:
        file.write(audio_bytes)
        path = file.name

    try:
        with _run_lock:
            segments, _info = model.transcribe(path, vad_filter=True)   # vad_filter skips silence
            return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        os.unlink(path)