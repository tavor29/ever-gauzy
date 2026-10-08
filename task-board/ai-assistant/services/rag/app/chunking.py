import uuid

from .schemas import ItemDoc

_NS = uuid.UUID("6f1c7a52-3f0e-4c0e-9d1a-2b8e5b8f9a10")


def render(doc: ItemDoc) -> str:
    """Flatten an item into readable text. Field labels help the model and the embedder."""
    lines = [f"[{doc.kind}] {doc.title}".strip()]
    if doc.status:
        lines.append(f"Status: {doc.status}")
    for name, value in doc.columns.items():
        if value:
            lines.append(f"{name}: {value}")
    if doc.author:
        lines.append(f"By: {doc.author}")
    if doc.body:
        lines.append(doc.body.strip())
    return "\n".join(lines)


def split(text: str, size: int, overlap: int) -> list[str]:
    """Split on paragraph boundaries where possible, falling back to a hard cut."""
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cut = text.rfind("\n", start + size // 2, end)
            if cut == -1:
                cut = text.rfind(" ", start + size // 2, end)
            if cut != -1:
                end = cut
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def chunk_id(item_id: str, n: int) -> str:
    """Deterministic point id, so re-indexing an item overwrites its old chunks."""
    return str(uuid.uuid5(_NS, f"{item_id}:{n}"))
