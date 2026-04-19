"""Journal routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

import journal
from kis_client import KISError
from schemas import (
    JournalCreateRequest,
    JournalDeleteResponse,
    JournalEntryResponse,
    JournalListResponse,
    JournalStatsResponse,
    JournalUpdateRequest,
)

router = APIRouter(prefix="/api")


@router.get("/journal", response_model=JournalListResponse)
def api_journal_list() -> JournalListResponse:
    return {"items": journal.list_entries()}


@router.post("/journal", response_model=JournalEntryResponse)
def api_journal_add(payload: JournalCreateRequest) -> JournalEntryResponse:
    return journal.add_entry(payload.model_dump(mode="json"))


@router.put("/journal/{entry_id}", response_model=JournalEntryResponse)
def api_journal_update(
    entry_id: str,
    payload: JournalUpdateRequest,
) -> JournalEntryResponse:
    patch = payload.model_dump(exclude_unset=True, mode="json")
    if not patch:
        raise HTTPException(status_code=400, detail="empty update payload")
    entry = journal.update_entry(entry_id, patch)
    if entry is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry


@router.delete("/journal/{entry_id}", response_model=JournalDeleteResponse)
def api_journal_delete(entry_id: str) -> JournalDeleteResponse:
    if not journal.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="entry not found")
    return {"deleted": entry_id}


@router.get("/journal/stats", response_model=JournalStatsResponse)
def api_journal_stats() -> JournalStatsResponse:
    return journal.stats()


@router.get("/journal/{entry_id}/tracking", response_model=JournalEntryResponse)
def api_journal_tracking(entry_id: str) -> JournalEntryResponse:
    try:
        entry = journal.refresh_tracking(entry_id)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if entry is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry
