from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EvalMessage(BaseModel):
    timestamp: datetime
    message_data: dict[str, Any]


class EvalDataset(BaseModel):
    name: str
    messages: list[EvalMessage]


class Grading(BaseModel):
    regexes: list[str] = Field(default_factory=list)
    semantic_refs: list[str] = Field(default_factory=list)
    weight: float = 1.0
    expected_answer: str | None = None  # Reference answer for LLM judge


class EvalQA(BaseModel):
    question: str
    grading: Grading


class EvalSpec(BaseModel):
    dataset: str
    timezone: str
    seed_time: datetime
    qas: list[EvalQA]
