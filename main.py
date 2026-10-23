"""Meeting Intelligence Assistant: backend API.

Run from this folder:   uvicorn main:app --port 8000
Then open:              http://localhost:8000
"""
import logging
import sqlite3
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config
import repository as repo
from database import get_db, init_db
from schemas import NewMeeting, NewMessage, Question
from services import analysis as gemini
from services import pdf_report, transcription

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("meeting-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not gemini.is_configured():
        log.warning("GEMINI_API_KEY is not set. Summaries and Q&A will not work. See backend/.env.example")
    if config.STT_ENGINE != "browser" and not transcription.is_configured():
        log.warning("GROQ_API_KEY is not set. Voice input will use Chrome speech recognition instead.")
    if config.STT_ENGINE == "local" and config.PRELOAD_WHISPER:
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


def find_ended_meeting(conn: sqlite3.Connection, meeting_id: int):
    meeting = find_meeting(conn, meeting_id)
    if meeting["status"] != "ended":
        raise HTTPException(409, "The meeting has not ended yet")
    return meeting


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
    """Ends the meeting. This is the ONLY moment Gemini is called for the analysis:
    one request returns the structured output and the summary of the whole meeting."""
    meeting = find_meeting(conn, meeting_id)

    if meeting["status"] == "created":
        raise HTTPException(409, "The meeting was never started")

    notice = ""
    if meeting["status"] == "live":
        summary = ""
        transcript = repo.get_transcript(conn, meeting_id)
        log.info("Ending meeting %s (%d messages). Asking Gemini for the analysis and summary ...",
                 meeting_id, len(transcript))
        started = time.monotonic()
        try:
            final = gemini.analyze_final(meeting["context"], transcript)
            repo.save_analysis(conn, meeting_id, final)
            summary = final.summary
            log.info("Gemini finished in %.1f seconds.", time.monotonic() - started)
        except Exception as error:
            log.exception("Final analysis failed. Saving the meeting without a summary.")
            notice = (gemini.describe_error(error)
                      + " The meeting is saved. Open it and press Generate summary to try again.")
        repo.finish_meeting(conn, meeting, summary)

    result = repo.full_meeting(conn, meeting_id)
    if notice:
        result["notice"] = notice
    return result


@app.post("/api/meetings/{meeting_id}/analyze")
def analyze_again(meeting_id: int, conn: sqlite3.Connection = Depends(get_db)):
    """Runs the final analysis and summary again for a finished meeting."""
    meeting = find_ended_meeting(conn, meeting_id)
    try:
        final = gemini.analyze_final(meeting["context"], repo.get_transcript(conn, meeting_id))
    except Exception as error:
        log.exception("Re-analysis failed")
        raise HTTPException(503, gemini.describe_error(error))
    repo.save_analysis(conn, meeting_id, final)
    repo.set_summary(conn, meeting_id, final.summary)
    return repo.full_meeting(conn, meeting_id)


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: int, conn: sqlite3.Connection = Depends(get_db)):
    find_meeting(conn, meeting_id)
    repo.delete_meeting(conn, meeting_id)
    return {"deleted": True}


# ---------- During the meeting (messages are only saved, no AI is called) ----------

@app.post("/api/meetings/{meeting_id}/messages")
def add_message(meeting_id: int, body: NewMessage, conn: sqlite3.Connection = Depends(get_db)):
    find_live_meeting(conn, meeting_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "The message is empty")

    source = body.source if body.source in ("text", "voice") else "text"   # "voice" = Chrome fallback
    repo.add_message(conn, meeting_id, body.speaker.strip() or "Guest", text, source)
    return {"saved": True}


@app.get("/api/stt-status")
def speech_status():
    """Tells the page if server speech-to-text is ready. If not, the page uses Chrome's."""
    return {"engine": config.STT_ENGINE, "ready": transcription.is_configured()}


@app.post("/api/meetings/{meeting_id}/audio")
def add_audio(
    meeting_id: int,
    audio: UploadFile = File(...),
    speaker: str = Form(""),
    conn: sqlite3.Connection = Depends(get_db),
):
    find_live_meeting(conn, meeting_id)
    speaker = speaker.strip() or "Speaker"

    try:
        text = transcription.transcribe(audio.file.read())
    except Exception:
        log.exception("Speech-to-text failed")
        raise HTTPException(503, "Speech-to-text failed. See the server log.")

    if text:                                       # silence gives '' and is not saved
        repo.add_message(conn, meeting_id, speaker, text, "voice")
    return {"speaker": speaker, "text": text}


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
    except Exception as error:
        log.exception("Question answering failed")
        raise HTTPException(503, gemini.describe_error(error))
    return {"answer": answer}


@app.get("/api/meetings/{meeting_id}/pdf")
def meeting_pdf(meeting_id: int, download: int = 0, conn: sqlite3.Connection = Depends(get_db)):
    """PDF report. Without ?download=1 the browser shows it; with it, the browser saves it."""
    find_ended_meeting(conn, meeting_id)
    meeting = repo.full_meeting(conn, meeting_id)

    mode = "attachment" if download else "inline"
    return Response(
        content=pdf_report.build_meeting_pdf(meeting),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{mode}; filename="{pdf_report.filename(meeting)}"'},
    )


# ---------- The web interface (index.html, css/, js/) ----------
# Only these paths are public, so files like .env can never be downloaded.

app.mount("/css", StaticFiles(directory=config.FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=config.FRONTEND_DIR / "js"), name="js")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(config.FRONTEND_DIR / "index.html")