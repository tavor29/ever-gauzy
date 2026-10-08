from functools import lru_cache

from sentence_transformers import SentenceTransformer

from .config import get_settings


@lru_cache
def _model() -> SentenceTransformer:
    # Loaded from the local HF cache baked into the image; HF_HUB_OFFLINE=1 blocks downloads.
    return SentenceTransformer(get_settings().embedding_model, device="cpu")


def _prefixes() -> tuple[str, str]:
    name = get_settings().embedding_model.lower()
    if "e5" in name:
        return "query: ", "passage: "
    if "bge" in name:
        return "Represent this sentence for searching relevant passages: ", ""
    return "", ""


def embed_passages(texts: list[str]) -> list[list[float]]:
    _, p = _prefixes()
    vecs = _model().encode([p + t for t in texts], normalize_embeddings=True, batch_size=32)
    return vecs.tolist()


def embed_query(text: str) -> list[float]:
    q, _ = _prefixes()
    return _model().encode(q + text, normalize_embeddings=True).tolist()
