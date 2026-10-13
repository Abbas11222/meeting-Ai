"""Settings, read from environment variables or the .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent          # folder that contains index.html, css/ and js/

load_dotenv(BASE_DIR / ".env")

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", BASE_DIR / "meetings.db"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
PRELOAD_WHISPER = os.getenv("PRELOAD_WHISPER", "0") == "1"