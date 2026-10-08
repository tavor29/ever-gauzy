from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ItemDoc(BaseModel):
    """One indexable object from the PM app: a board, item, update/comment or doc."""

    id: str
    kind: Literal["board", "item", "update", "doc"]
    workspace_id: str
    board_id: str
    parent_item_id: str | None = None   # for updates/comments
    title: str = ""
    body: str = ""                      # description, comment text or doc content
    status: str | None = None
    # Only columns the app marks as AI-visible. Private columns never reach this service.
    columns: dict[str, str] = Field(default_factory=dict)
    author: str | None = None
    updated_at: datetime | None = None


class ItemEvent(BaseModel):
    op: Literal["upsert", "delete"]
    doc: ItemDoc | None = None          # required for upsert
    id: str | None = None               # required for delete


class Principal(BaseModel):
    """Who is asking, as resolved by the app backend from the login session.

    The RAG service never decides permissions itself. It trusts this object only
    because it arrives with the shared service token, and it filters every search by it.
    """

    user_id: str
    workspace_ids: list[str]
    board_ids: list[str]                # every board this user may read


class SearchRequest(BaseModel):
    principal: Principal
    query: str = Field(min_length=1, max_length=2000)
    board_id: str | None = None         # narrow to one board; must be in principal.board_ids
    top_k: int | None = None


class ChatRequest(SearchRequest):
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class Hit(BaseModel):
    item_id: str
    kind: str
    board_id: str
    title: str
    text: str
    score: float
