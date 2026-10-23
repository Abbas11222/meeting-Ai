"""All database reads and writes. Routes never write SQL themselves."""
import sqlite3
from datetime import datetime, timezone

from schemas import MeetingAnalysis


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------- Meeting life cycle ----------

def create_meeting(conn: sqlite3.Connection, title: str, context: str) -> dict:
    with conn:
        cursor = conn.execute(
            "INSERT INTO meetings (title, context, created_at) VALUES (?, ?, ?)",
            (title, context, now()),
        )
    return {"id": str(cursor.lastrowid), "title": title, "context": context}


def get_meeting(conn: sqlite3.Connection, meeting_id: int):
    return conn.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone()


def mark_started(conn: sqlite3.Connection, meeting_id: int) -> None:
    with conn:
        conn.execute(
            "UPDATE meetings SET status = 'live', started_at = ? WHERE id = ?",
            (now(), meeting_id),
        )


def finish_meeting(conn: sqlite3.Connection, meeting, summary: str) -> None:
    ended = datetime.now(timezone.utc)
    started = datetime.fromisoformat(meeting["started_at"])
    minutes = max(1, round((ended - started).total_seconds() / 60))
    with conn:
        conn.execute(
            "UPDATE meetings SET status = 'ended', summary = ?, duration_min = ?, ended_at = ? WHERE id = ?",
            (summary, minutes, ended.isoformat(timespec="seconds"), meeting["id"]),
        )


def set_summary(conn: sqlite3.Connection, meeting_id: int, summary: str) -> None:
    with conn:
        conn.execute("UPDATE meetings SET summary = ? WHERE id = ?", (summary, meeting_id))


def delete_meeting(conn: sqlite3.Connection, meeting_id: int) -> None:
    """Deletes the meeting and, through the foreign keys, everything stored for it."""
    with conn:
        conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))


# ---------- Messages ----------

def add_message(conn: sqlite3.Connection, meeting_id: int, speaker: str, text: str, source: str) -> None:
    with conn:
        conn.execute(
            "INSERT INTO messages (meeting_id, speaker, text, source, created_at) VALUES (?, ?, ?, ?, ?)",
            (meeting_id, speaker, text, source, now()),
        )


def get_transcript(conn: sqlite3.Connection, meeting_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT speaker, text FROM messages WHERE meeting_id = ? ORDER BY id", (meeting_id,)
    ).fetchall()
    return [{"speaker": row["speaker"], "text": row["text"]} for row in rows]


# ---------- Extracted information (topics, decisions, tasks, questions) ----------

def save_analysis(conn: sqlite3.Connection, meeting_id: int, analysis: MeetingAnalysis) -> None:
    """Replaces what was stored before with the newest full analysis."""
    with conn:
        for table in ("topics", "decisions", "questions", "action_items"):
            conn.execute(f"DELETE FROM {table} WHERE meeting_id = ?", (meeting_id,))

        conn.executemany(
            "INSERT INTO topics (meeting_id, name) VALUES (?, ?)",
            [(meeting_id, name) for name in analysis.topics],
        )
        conn.executemany(
            "INSERT INTO decisions (meeting_id, text) VALUES (?, ?)",
            [(meeting_id, text) for text in analysis.decisions],
        )
        conn.executemany(
            "INSERT INTO questions (meeting_id, text) VALUES (?, ?)",
            [(meeting_id, text) for text in analysis.questions],
        )
        conn.executemany(
            "INSERT INTO action_items (meeting_id, task, owner, deadline) VALUES (?, ?, ?, ?)",
            [(meeting_id, item.task, item.owner, item.deadline) for item in analysis.action_items],
        )


def load_analysis(conn: sqlite3.Connection, meeting_id: int) -> dict:
    """Stored analysis in the shape the interface expects."""
    def column(sql: str) -> list:
        return [row[0] for row in conn.execute(sql, (meeting_id,)).fetchall()]

    actions = conn.execute(
        "SELECT task, owner, deadline, done FROM action_items WHERE meeting_id = ? ORDER BY id",
        (meeting_id,),
    ).fetchall()

    return {
        "topics": column("SELECT name FROM topics WHERE meeting_id = ? ORDER BY id"),
        "decisions": column("SELECT text FROM decisions WHERE meeting_id = ? ORDER BY id"),
        "action_items": [
            {"task": a["task"], "owner": a["owner"], "deadline": a["deadline"], "done": bool(a["done"])}
            for a in actions
        ],
        "questions": column("SELECT text FROM questions WHERE meeting_id = ? ORDER BY id"),
    }


# ---------- Reading for the interface ----------

def full_meeting(conn: sqlite3.Connection, meeting_id: int) -> dict:
    meeting = get_meeting(conn, meeting_id)
    return {
        "id": str(meeting["id"]),
        "title": meeting["title"],
        "date": (meeting["ended_at"] or meeting["created_at"])[:10],
        "duration_min": meeting["duration_min"],
        "context": meeting["context"],
        "summary": meeting["summary"],
        "transcript": get_transcript(conn, meeting_id),
        **load_analysis(conn, meeting_id),
    }


def list_meetings(conn: sqlite3.Connection, search: str = "", limit: int | None = None) -> list[dict]:
    """Finished meetings, newest first. `search` matches the title or a topic."""
    pattern = f"%{search}%"
    rows = conn.execute(
        """
        SELECT m.id, m.title, m.ended_at, m.duration_min,
               (SELECT COUNT(*) FROM decisions    d WHERE d.meeting_id = m.id) AS decision_count,
               (SELECT COUNT(*) FROM action_items a WHERE a.meeting_id = m.id) AS action_count
        FROM meetings m
        WHERE m.status = 'ended'
          AND (m.title LIKE ?
               OR EXISTS (SELECT 1 FROM topics t WHERE t.meeting_id = m.id AND t.name LIKE ?))
        ORDER BY m.ended_at DESC
        LIMIT ?
        """,
        (pattern, pattern, limit if limit else -1),
    ).fetchall()

    result = []
    for row in rows:
        topics = [t[0] for t in conn.execute("SELECT name FROM topics WHERE meeting_id = ?", (row["id"],))]
        result.append({
            "id": str(row["id"]),
            "title": row["title"],
            "date": row["ended_at"][:10],
            "duration_min": row["duration_min"],
            "topics": topics,
            "decision_count": row["decision_count"],
            "action_count": row["action_count"],
        })
    return result


def dashboard(conn: sqlite3.Connection) -> dict:
    """Numbers for the first page, all calculated from the database."""
    def count(sql: str) -> int:
        return conn.execute(sql).fetchone()[0]

    ended = "FROM meetings m WHERE m.status = 'ended'"
    done = count(f"SELECT COUNT(*) FROM action_items a JOIN meetings m ON m.id = a.meeting_id "
                 f"WHERE m.status = 'ended' AND a.done = 1")
    total_actions = count("SELECT COUNT(*) FROM action_items a JOIN meetings m ON m.id = a.meeting_id "
                          "WHERE m.status = 'ended'")

    return {
        "stats": {
            "meetings": count(f"SELECT COUNT(*) {ended}"),
            "decisions": count("SELECT COUNT(*) FROM decisions d JOIN meetings m ON m.id = d.meeting_id "
                               "WHERE m.status = 'ended'"),
            "action_items": total_actions,
            "open_action_items": total_actions - done,
        },
        "weekly": _meetings_per_week(conn),
        "actions": {"done": done, "open": total_actions - done},
        "recent": list_meetings(conn, limit=5),
    }


def _meetings_per_week(conn: sqlite3.Connection, weeks: int = 6) -> list[dict]:
    """Meetings finished in each of the last `weeks` weeks, oldest first."""
    counts = [0] * weeks
    today = datetime.now(timezone.utc)

    for (ended_at,) in conn.execute("SELECT ended_at FROM meetings WHERE status = 'ended'"):
        weeks_ago = (today - datetime.fromisoformat(ended_at)).days // 7
        if 0 <= weeks_ago < weeks:
            counts[weeks - 1 - weeks_ago] += 1

    labels = ["This wk" if i == weeks - 1 else f"{weeks - 1 - i}w ago" for i in range(weeks)]
    return [{"label": label, "count": count} for label, count in zip(labels, counts)]