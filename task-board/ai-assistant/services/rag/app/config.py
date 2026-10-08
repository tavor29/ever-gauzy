from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    rag_service_token: str

    ollama_url: str = "http://ollama:11434"
    llm_model: str = "pm-mistral"
    llm_temperature: float = 0.2
    llm_max_tokens: int = 768
    llm_timeout_s: float = 120.0

    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "pm_items"

    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    rag_top_k: int = 8
    rag_min_score: float = 0.35
    max_context_chars: int = 12_000
    chunk_chars: int = 800
    chunk_overlap: int = 120

    kafka_bootstrap: str = ""
    kafka_topic: str = "board.task-events"
    kafka_group: str = "rag-indexer"


@lru_cache
def get_settings() -> Settings:
    return Settings()
