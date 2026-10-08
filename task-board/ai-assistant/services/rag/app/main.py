import asyncio
import contextlib
import hmac
import json
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from . import llm, store
from .config import get_settings
from .embeddings import embed_query
from .indexer import handle_event
from .prompt import build_prompt
from .schemas import ChatRequest, Hit, ItemEvent, SearchRequest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("rag")


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    await store.ensure_collection()
    stop, task = asyncio.Event(), None
    if get_settings().kafka_bootstrap:
        from .consumer import run_consumer

        task = asyncio.create_task(run_consumer(stop))
    yield
    stop.set()
    if task:
        await task


app = FastAPI(title="PM AI RAG service", lifespan=lifespan, docs_url=None, redoc_url=None)


def require_service_token(authorization: str = Header(default="")) -> None:
    """Only the app backend holds this token. End users never call this service directly."""
    expected = f"Bearer {get_settings().rag_service_token}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


def _check_scope(req: SearchRequest) -> None:
    if req.board_id and req.board_id not in req.principal.board_ids:
        raise HTTPException(status_code=403, detail="board not permitted for this user")


async def _retrieve(req: SearchRequest) -> list[Hit]:
    s = get_settings()
    vector = await asyncio.to_thread(embed_query, req.query)
    top_k = min(req.top_k or s.rag_top_k, 20)
    return await store.search(vector, req.principal, req.board_id, top_k)


@app.get("/healthz")
async def healthz():
    return {"ok": True, "llm_ready": await llm.health()}


@app.post("/index", dependencies=[Depends(require_service_token)])
async def index(events: list[ItemEvent]):
    for e in events:
        await handle_event(e)
    return {"indexed": len(events)}


@app.post("/search", dependencies=[Depends(require_service_token)])
async def search(req: SearchRequest) -> list[Hit]:
    _check_scope(req)
    return await _retrieve(req)


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/chat", dependencies=[Depends(require_service_token)])
async def chat(req: ChatRequest):
    _check_scope(req)
    s = get_settings()
    hits = await _retrieve(req)
    prompt = build_prompt(req.query, hits, req.history, s.max_context_chars)

    async def events():
        # Sources first, so the UI can show "based on" links while the answer streams.
        yield _sse("sources", [{"item_id": h.item_id, "title": h.title, "board_id": h.board_id} for h in hits])
        try:
            async for token in llm.stream_completion(prompt):
                yield _sse("token", token)
        except Exception:
            log.exception("llm stream failed for user %s", req.principal.user_id)
            yield _sse("error", "The assistant is unavailable right now.")
        yield _sse("done", {})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
