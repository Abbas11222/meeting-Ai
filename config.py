"""Settings, read from environment variables or the .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Folder that contains index.html, css/ and js/.
# Works whether main.py sits next to index.html or inside a "backend" subfolder.
FRONTEND_DIR = BASE_DIR if (BASE_DIR / "index.html").exists() else BASE_DIR.parent

load_dotenv(BASE_DIR / ".env")

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", BASE_DIR / "meetings.db"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "90"))   # stop waiting after this long


# Speech-to-text engine: "groq" (hosted Whisper, no download) or "local" (faster-whisper on this PC)
STT_ENGINE = os.getenv("STT_ENGINE", "groq").lower()
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "")          # empty = detect automatically

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")

# Only used when STT_ENGINE=local
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
PRELOAD_WHISPER = os.getenv("PRELOAD_WHISPER", "0") == "1"