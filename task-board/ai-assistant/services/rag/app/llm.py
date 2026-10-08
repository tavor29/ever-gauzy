"""Client for the local Ollama server. Nothing here talks to an external provider."""

import json
from collections.abc import AsyncIterator

import httpx

from .config import get_settings


async def stream_completion(prompt: str) -> AsyncIterator[str]:
    """Stream tokens for an already-formatted Mistral prompt (raw mode skips Ollama's template)."""
    s = get_settings()
    body = {
        "model": s.llm_model,
        "prompt": prompt,
        "raw": True,
        "stream": True,
        "options": {
            "temperature": s.llm_temperature,
            "num_predict": s.llm_max_tokens,
            "stop": ["</s>", "[INST]"],
        },
    }
    timeout = httpx.Timeout(s.llm_timeout_s, connect=5.0)
    async with httpx.AsyncClient(base_url=s.ollama_url, timeout=timeout) as http:
        async with http.stream("POST", "/api/generate", json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                if chunk.get("error"):
                    raise RuntimeError(chunk["error"])
                if token := chunk.get("response"):
                    yield token
                if chunk.get("done"):
                    break


async def health() -> bool:
    s = get_settings()
    try:
        async with httpx.AsyncClient(base_url=s.ollama_url, timeout=5.0) as http:
            r = await http.get("/api/tags")
            return r.status_code == 200 and any(
                m.get("name", "").split(":")[0] == s.llm_model for m in r.json().get("models", [])
            )
    except httpx.HTTPError:
        return False
