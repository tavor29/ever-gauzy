"""Turns task events from the Gauzy board (topic board.task-events) into index events.

The event shape is defined in packages/plugins/board-events/src/lib/outbox/task-event.ts.
Gauzy organization -> workspace, Gauzy project -> board, Gauzy task -> item.
"""

from typing import Any

from .schemas import ItemDoc, ItemEvent


def is_board_event(value: Any) -> bool:
    return isinstance(value, dict) and value.get("version") == 1 and "task" in value


def to_item_event(evt: dict[str, Any]) -> ItemEvent:
    task = evt["task"]
    # A deleted task, or one taken out of every project, must leave the index.
    if evt["type"] == "task.deleted" or not evt.get("project_id"):
        return ItemEvent(op="delete", id=task["id"])

    number = f'{task["prefix"]}-{task["number"]} ' if task.get("prefix") and task.get("number") else ""
    columns = {
        "Priority": task.get("priority"),
        "Due date": (task.get("due_date") or "")[:10] or None,
    }
    return ItemEvent(
        op="upsert",
        doc=ItemDoc(
            id=task["id"],
            kind="item",
            workspace_id=evt["organization_id"],
            board_id=evt["project_id"],
            title=f'{number}{task.get("title") or ""}',
            body=task.get("description") or "",
            status=task.get("status"),
            columns={k: v for k, v in columns.items() if v},
            updated_at=evt.get("occurred_at"),
        ),
    )
