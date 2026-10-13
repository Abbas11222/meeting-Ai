# Backend

FastAPI + SQLite. Whisper Large-v3 Turbo for speech-to-text, Gemini Flash for analysis.

## Run (Windows PowerShell, Python 3.10 or newer)

```
cd backend
pip install -r requirements.txt
copy .env.example .env        # then open .env and paste your GEMINI_API_KEY
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000 (do not use `python -m http.server` any more).
API documentation: http://localhost:8000/docs

## Notes
- The first voice message downloads the Whisper model (about 1.5 GB) and is slow.
  Set `PRELOAD_WHISPER=1` in `.env` to load it at start-up instead.
- Without a GPU, Whisper may take several seconds per 5-second part.
  Typing in the chat works at the same speed as Gemini.
- Data is stored in `backend/meetings.db`. Delete the file to start fresh.