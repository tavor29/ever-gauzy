from qdrant_client import AsyncQdrantClient, models

from .config import get_settings
from .schemas import Hit, Principal

_client: AsyncQdrantClient | None = None


def client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        s = get_settings()
        _client = AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key)
    return _client


async def ensure_collection() -> None:
    s = get_settings()
    c = client()
    if not await c.collection_exists(s.qdrant_collection):
        await c.create_collection(
            s.qdrant_collection,
            vectors_config=models.VectorParams(size=s.embedding_dim, distance=models.Distance.COSINE),
        )
    # Payload indexes make the permission filter fast and exact.
    for field in ("workspace_id", "board_id", "item_id"):
        await c.create_payload_index(s.qdrant_collection, field, models.PayloadSchemaType.KEYWORD)


async def upsert_chunks(points: list[models.PointStruct]) -> None:
    await client().upsert(get_settings().qdrant_collection, points=points, wait=True)


async def delete_item(item_id: str) -> None:
    await client().delete(
        get_settings().qdrant_collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(must=[models.FieldCondition(key="item_id", match=models.MatchValue(value=item_id))])
        ),
        wait=True,
    )


def acl_filter(principal: Principal, board_id: str | None) -> models.Filter:
    """The permission boundary. Every query goes through this; there is no unfiltered search."""
    must = [
        models.FieldCondition(key="workspace_id", match=models.MatchAny(any=principal.workspace_ids)),
        models.FieldCondition(key="board_id", match=models.MatchAny(any=principal.board_ids)),
    ]
    if board_id:
        must.append(models.FieldCondition(key="board_id", match=models.MatchValue(value=board_id)))
    return models.Filter(must=must)


async def search(vector: list[float], principal: Principal, board_id: str | None, top_k: int) -> list[Hit]:
    s = get_settings()
    if not principal.board_ids or not principal.workspace_ids:
        return []
    res = await client().query_points(
        s.qdrant_collection,
        query=vector,
        query_filter=acl_filter(principal, board_id),
        limit=top_k,
        score_threshold=s.rag_min_score,
        with_payload=True,
    )
    return [
        Hit(
            item_id=p.payload["item_id"],
            kind=p.payload["kind"],
            board_id=p.payload["board_id"],
            title=p.payload.get("title", ""),
            text=p.payload["text"],
            score=p.score,
        )
        for p in res.points
    ]
