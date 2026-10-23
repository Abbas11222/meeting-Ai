# Backend

FastAPI + SQLite. Whisper Large-v3 Turbo for speech-to-text (hosted by Groq, or local), Gemini Flash for analysis.

## Run (Windows PowerShell, Python 3.10 or newer)

```
cd backend
pip install -r requirements.txt
copy .env.example .env        # then open .env and paste your GEMINI_API_KEY and GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000 (do not use `python -m http.server` any more).
API documentation: http://localhost:8000/docs

## Notes
- Speech-to-text uses Groq by default (`STT_ENGINE=groq`). To run Whisper on your own
  computer instead, set `STT_ENGINE=local` and run `pip install faster-whisper`.
  The first local voice message downloads the model (about 1.5 GB).
- Data is stored in `backend/meetings.db`. Delete the file to start fresh.