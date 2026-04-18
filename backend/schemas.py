"""Request and response schemas for the FastAPI application."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

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


class JournalTracking(BaseModel):
    d1: Optional[float] = None
    d3: Optional[float] = None
    d5: Optional[float] = None
    d10: Optional[float] = None


class JournalEntryResponse(BaseModel):
    id: str
    code: str
    name: str = ""
    entry_date: date
    entry_price: float
    reason: JournalReason
    weight_pct: float
    memo: str = ""
    exit_date: Optional[date] = None
    exit_price: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    tracking: JournalTracking
    category: Optional[str] = None


class JournalListResponse(BaseModel):
    items: list[JournalEntryResponse]


class JournalDeleteResponse(BaseModel):
    deleted: str


class JournalReasonStats(BaseModel):
    count: int
    wins: int
    avg_return: float
    win_rate: Optional[float] = None


class JournalStatsResponse(BaseModel):
    total_count: int
    closed_count: int
    open_count: int
    win_count: int
    loss_count: int
    win_rate: float
    avg_return_pct: float
    max_consecutive_wins: int
    max_consecutive_losses: int
    avg_win_pct: float
    avg_loss_pct: float
    profit_factor: Optional[float] = None
    by_reason: dict[str, JournalReasonStats]
