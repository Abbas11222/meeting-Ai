"""Meeting Intelligence Assistant: backend API.

Run from this folder:   uvicorn main:app --reload --port 8000
Then open:              http://localhost:8000
"""
import logging
import sqlite3
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config
import repository as repo
from database import get_db, init_db
from schemas import MeetingAnalysis, NewMeeting, NewMessage, Question
from services import analysis as gemini
from services import transcription

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("meeting-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not gemini.is_configured():
        log.warning("GEMINI_API_KEY is not set. Analysis, summaries and Q&A will not work. See backend/.env.example")
    if config.PRELOAD_WHISPER:
        threading.Thread(target=transcription.load_model, daemon=True).start()
    yield


app = FastAPI(title="Meeting Intelligence Assistant", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------- Helpers ----------

def find_meeting(conn: sqlite3.Connection, meeting_id: int):
    meeting = repo.get_meeting(conn, meeting_id)
    if meeting is None:
        raise HTTPException(404, "Meeting not found")
    return meeting


def find_live_meeting(conn: sqlite3.Connection, meeting_id: int):
    meeting = find_meeting(conn, meeting_id)
    if meeting["status"] != "live":
        raise HTTPException(409, "The meeting is not running")
    return meeting


def refresh_analysis(conn: sqlite3.Connection, meeting) -> dict:
    """Asks Gemini to analyze the whole discussion, stores the result and returns it.
    If Gemini fails, the last stored analysis is returned so the live page keeps working."""
    try:
        transcript = repo.get_transcript(conn, meeting["id"])
        result = gemini.analyze_meeting(meeting["context"], transcript)
        repo.save_analysis(conn, meeting["id"], result)
    except Exception:
        log.exception("Analysis failed. Returning the last stored analysis.")
    return repo.load_analysis(conn, meeting["id"])


# ---------- Reading ----------

@app.get("/api/dashboard")
def get_dashboard(conn: sqlite3.Connection = Depends(get_db)):
    return repo.dashboard(conn)


@app.get("/api/meetings")
def get_meetings(q: str = "", conn: sqlite3.Connection = Depends(get_db)):
    return repo.list_meetings(conn, search=q.strip())


@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: int, conn: sqlite3.Connection = Depends(get_db)):
    find_meeting(conn, meeting_id)
    return repo.full_meeting(conn, meeting_id)


# ---------- Meeting life cycle ----------

@app.post("/api/meetings")
def create_meeting(body: NewMeeting, conn: sqlite3.Connection = Depends(get_db)):
    title = body.title.strip()
    if not title:
        raise HTTPException(422, "A meeting title is required")
    return repo.create_meeting(conn, title, body.context.strip())


@app.post("/api/meetings/{meeting_id}/start")
def start_meeting(meeting_id: int, conn: sqlite3.Connection = Depends(get_db)):
    meeting = find_meeting(conn, meeting_id)
    if meeting["status"] == "ended":
        raise HTTPException(409, "This meeting has already ended")
    if meeting["status"] == "created":
        repo.mark_started(conn, meeting_id)
    return {"status": "live"}


@app.post("/api/meetings/{meeting_id}/end")
def end_meeting(meeting_id: int, conn: sqlite3.Connection = Depends(get_db)):
    meeting = find_meeting(conn, meeting_id)

    if meeting["status"] == "created":
        raise HTTPException(409, "The meeting was never started")

    if meeting["status"] == "live":
        transcript = repo.get_transcript(conn, meeting_id)
        summary = ""
        try:
            # One last analysis of the complete discussion, then the summary.
            analysis = gemini.analyze_meeting(meeting["context"], transcript)
            repo.save_analysis(conn, meeting_id, analysis)
            summary = gemini.summarize_meeting(meeting["context"], transcript, analysis)
        except Exception:
            log.exception("Final analysis failed. Saving the meeting without a summary.")
        repo.finish_meeting(conn, meeting, summary)

    return repo.full_meeting(conn, meeting_id)


# ---------- During the meeting ----------

@app.post("/api/meetings/{meeting_id}/messages")
def add_message(meeting_id: int, body: NewMessage, conn: sqlite3.Connection = Depends(get_db)):
    meeting = find_live_meeting(conn, meeting_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "The message is empty")

    repo.add_message(conn, meeting_id, body.speaker.strip() or "Guest", text, "text")
    return refresh_analysis(conn, meeting)


@app.post("/api/meetings/{meeting_id}/audio")
def add_audio(
    meeting_id: int,
    audio: UploadFile = File(...),
    speaker: str = Form(""),
    conn: sqlite3.Connection = Depends(get_db),
):
    meeting = find_live_meeting(conn, meeting_id)
    speaker = speaker.strip() or "Speaker"

    try:
        text = transcription.transcribe(audio.file.read())
    except Exception:
        log.exception("Speech-to-text failed")
        raise HTTPException(503, "Speech-to-text failed. See the server log.")

    if not text:                                   # silence: nothing to add
        return {"speaker": speaker, "text": "", "analysis": repo.load_analysis(conn, meeting_id)}

    repo.add_message(conn, meeting_id, speaker, text, "voice")
    return {"speaker": speaker, "text": text, "analysis": refresh_analysis(conn, meeting)}


# ---------- After the meeting ----------

@app.post("/api/meetings/{meeting_id}/ask")
def ask(meeting_id: int, body: Question, conn: sqlite3.Connection = Depends(get_db)):
    find_meeting(conn, meeting_id)
    try:
        answer = gemini.answer_question(
            repo.get_transcript(conn, meeting_id),
            repo.load_analysis(conn, meeting_id),
            body.question.strip(),
        )
    except Exception:
        log.exception("Question answering failed")
        raise HTTPException(503, "Could not answer. Check the Gemini settings in backend/.env")
    return {"answer": answer}


# ---------- The web interface (index.html, css/, js/) ----------
# Only these paths are public, so files in backend/ (like .env) can never be downloaded.

app.mount("/css", StaticFiles(directory=config.FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=config.FRONTEND_DIR / "js"), name="js")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(config.FRONTEND_DIR / "index.html")