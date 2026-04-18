"""Request schemas for the FastAPI application."""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class JournalReason(str, Enum):
    closing_bet = "closing_bet"
    breakout = "breakout"
    pullback = "pullback"


class JournalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: str = Field(pattern=r"^\d{6}$")
    name: str = Field(default="", max_length=100)
    entry_date: date
    entry_price: float = Field(gt=0)
    reason: JournalReason = JournalReason.closing_bet
    weight_pct: float = Field(default=0, ge=0, le=100)
    memo: str = Field(default="", max_length=2000)
    exit_date: Optional[date] = None
    exit_price: Optional[float] = Field(default=None, gt=0)


class JournalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, max_length=100)
    entry_date: Optional[date] = None
    entry_price: Optional[float] = Field(default=None, gt=0)
    reason: Optional[JournalReason] = None
    weight_pct: Optional[float] = Field(default=None, ge=0, le=100)
    memo: Optional[str] = Field(default=None, max_length=2000)
    exit_date: Optional[date] = None
    exit_price: Optional[float] = Field(default=None, gt=0)
