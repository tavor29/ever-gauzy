import asyncio
import logging

from qdrant_client import models

from . import store
from .chunking import chunk_id, render, split
from .config import get_settings
from .embeddings import embed_passages
from .schemas import ItemEvent

log = logging.getLogger("rag.indexer")


async def handle_event(event: ItemEvent) -> None:
    if event.op == "delete":
        if not event.id:
            raise ValueError("delete event needs id")
        await store.delete_item(event.id)
        return

    if event.doc is None:
        raise ValueError("upsert event needs doc")
    doc = event.doc
    s = get_settings()
    chunks = split(render(doc), s.chunk_chars, s.chunk_overlap)
    # Embedding is CPU-bound; keep the event loop free for chat traffic.
    vectors = await asyncio.to_thread(embed_passages, chunks)

    points = [
        models.PointStruct(
            id=chunk_id(doc.id, n),
            vector=vec,
            payload={
                "item_id": doc.id,
                "kind": doc.kind,
                "workspace_id": doc.workspace_id,
                "board_id": doc.board_id,
                "parent_item_id": doc.parent_item_id,
                "title": doc.title,
                "text": text,
                "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            },
        )
        for n, (text, vec) in enumerate(zip(chunks, vectors))
    ]
    # Drop stale chunks first: an edited item may now have fewer chunks than before.
    await store.delete_item(doc.id)
    await store.upsert_chunks(points)
    log.info("indexed %s %s (%d chunks)", doc.kind, doc.id, len(points))
