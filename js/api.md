# Backend API used by the interface

All answers are JSON except the PDF. Set `API_BASE` in `js/config.js` if the backend runs on another address.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Numbers and charts for the first page |
| GET | `/api/meetings?q=` | Finished meetings (q = optional search text) |
| GET | `/api/meetings/{id}` | One full meeting |
| POST | `/api/meetings` | Create a meeting. Body: `{title, context}` |
| POST | `/api/meetings/{id}/start` | Start the meeting |
| POST | `/api/meetings/{id}/messages` | Save a typed message. Body: `{speaker, text, source}` |
| POST | `/api/meetings/{id}/audio` | Save speech (multipart: `audio`, `speaker`). Returns `{speaker, text}` |
| POST | `/api/meetings/{id}/end` | End the meeting. **The only Gemini call for analysis.** Returns the full meeting |
| POST | `/api/meetings/{id}/analyze` | Run the final analysis and summary again (when it failed at the end) |
| POST | `/api/meetings/{id}/ask` | Q&A. Body: `{question}` returns `{answer}` |
| DELETE | `/api/meetings/{id}` | Delete a meeting and everything stored for it |
| GET | `/api/meetings/{id}/pdf` | PDF report shown in the browser. Add `?download=1` to save it |

During the meeting nothing is analyzed: messages and speech are only saved.
When the meeting ends, ONE Gemini request returns the structured output and the summary.

Errors are returned as `{"detail": "message"}`. The interface shows that message.

## GET /api/dashboard
```json
{
 "stats": {"meetings": 0, "decisions": 0, "action_items": 0, "open_action_items": 0},
 "weekly": [{"label": "string", "count": 0}],
 "actions": {"done": 0, "open": 0},
 "recent": [ <meeting row> ]
}
```

## Meeting row
```json
{"id": "string", "title": "string", "date": "YYYY-MM-DD", "duration_min": 0,
 "topics": ["string"], "decision_count": 0, "action_count": 0}
```

## Full meeting (GET /api/meetings/{id}, and the answer of /end and /analyze)
```json
{"id": "string", "title": "string", "date": "YYYY-MM-DD", "duration_min": 0,
 "context": "string", "summary": "string", "topics": ["string"],
 "decisions": ["string"],
 "action_items": [{"task": "string", "owner": "string|null", "deadline": "string|null", "done": false}],
 "questions": ["string"],
 "transcript": [{"speaker": "string", "text": "string"}],
 "notice": "string (only from /end, when Gemini failed)"}
```

## Structured output Gemini must return (schemas.py: FinalAnalysis)
```json
{"topics": ["string"], "decisions": ["string"],
 "action_items": [{"task": "string", "owner": "string|null", "deadline": "string|null"}],
 "questions": ["string"], "summary": "string"}
```