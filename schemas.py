"""Data shapes.

MeetingAnalysis is also the "structured output" format Gemini must follow.
(No default values on purpose: the Gemini schema does not accept them.)
"""
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Structured output from Gemini ----------

class ActionItem(BaseModel):
    task: str = Field(description="What must be done, short and clear.")
    owner: Optional[str] = Field(description="Person responsible, or null if nobody was named.")
    deadline: Optional[str] = Field(description="Deadline as said in the meeting (e.g. 'Friday'), or null.")


class MeetingAnalysis(BaseModel):
    current_topic: Optional[str] = Field(description="Topic being discussed most recently, or null.")
    topics: list[str] = Field(description="Main topics discussed, as short phrases.")
    decisions: list[str] = Field(description="Choices the group actually agreed on.")
    action_items: list[ActionItem] = Field(description="Tasks assigned or accepted during the meeting.")
    questions: list[str] = Field(description="Important questions raised in the meeting.")

    @classmethod
    def empty(cls) -> "MeetingAnalysis":
        return cls(current_topic=None, topics=[], decisions=[], action_items=[], questions=[])


# ---------- Request bodies ----------

class NewMeeting(BaseModel):
    title: str
    context: str = ""


class NewMessage(BaseModel):
    speaker: str
    text: str
    source: str = "text"


class Question(BaseModel):
    question: str