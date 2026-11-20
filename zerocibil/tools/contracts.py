"""Pydantic contracts for tool boundaries."""

from typing import Any
from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    ok: bool
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class ScoreInput(BaseModel):
    model: str
    features: dict[str, float]
    variant: str | None = None


class ScoreOutput(BaseModel):
    probability: float
    model_version: str

