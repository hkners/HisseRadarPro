"""
Copilot Router
Handles /api/copilot/chat — grounded Turkish Q&A over the user's portfolio and BIST data.
"""
from typing import List, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/copilot", tags=["copilot"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)


@router.post("/chat")
def copilot_chat(req: ChatRequest):
    from services.copilot_service import chat
    return chat([m.model_dump() for m in req.messages])
