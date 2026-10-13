# Backend API expected by the interface

All responses are JSON. Set `API_BASE` at the top of `app.js` if the backend runs on another address (enable CORS).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Numbers and charts for the first page |
| GET | `/api/meetings?q=` | List of previous meetings (q = optional search text) |
| GET | `/api/meetings/{id}` | One full meeting |
| POST | `/api/meetings` | Create a meeting. Body: `{title, context}` |
| POST | `/api/meetings/{id}/start` | Mark the meeting as started |
| POST | `/api/meetings/{id}/messages` | Typed message. Body: `{speaker, text, source}` |
| POST | `/api/meetings/{id}/audio` | Audio chunk (multipart: `audio`, `speaker`) |
| POST | `/api/meetings/{id}/end` | End meeting, generate summary, return full meeting |
| POST | `/api/meetings/{id}/ask` | Q&A. Body: `{question}` returns `{answer}` |

## GET /api/dashboard
```json
{
 "stats": {"meetings": 0, "decisions": 0, "action_items": 0, "open_action_items": 0},
 "weekly": [{"label": "string", "count": 0}],
 "actions": {"done": 0, "open": 0},
 "recent": [ <meeting row> ]
}
```

## Meeting row (dashboard `recent` and `/api/meetings`)
```json
{"id": "string", "title": "string", "date": "YYYY-MM-DD", "duration_min": 0,
 "topics": ["string"], "decision_count": 0, "action_count": 0}
```

## GET /api/meetings/{id}
```json
{"id": "string", "title": "string", "date": "YYYY-MM-DD", "duration_min": 0,
 "context": "string", "summary": "string", "topics": ["string"],
 "decisions": ["string"],
 "action_items": [{"task": "string", "owner": "string|null", "deadline": "string|null", "done": false}],
 "questions": ["string"],
 "transcript": [{"speaker": "string", "text": "string"}]}
```

## POST /api/meetings returns
`{"id": "string", "title": "string", "context": "string"}`

## Live analysis (returned by `/messages`, inside `/audio`)
```json
{"current_topic": "string|null", "topics": ["string"], "decisions": ["string"],
 "action_items": [{"task": "string", "owner": "string|null", "deadline": "string|null"}],
 "questions": ["string"]}
```
`/audio` returns `{"speaker": "string|null", "text": "string", "analysis": <live analysis>}`.