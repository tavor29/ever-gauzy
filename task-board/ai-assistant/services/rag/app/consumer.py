"""Optional Kafka consumer: indexes item events from the app's event stream.

Accepts both the generic ItemEvent shape and the Gauzy board's task events (board_events.py).

If KAFKA_BOOTSTRAP is empty, the app backend calls POST /index instead.
"""

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from pydantic import ValidationError

from .config import get_settings
from .board_events import is_board_event, to_item_event
from .indexer import handle_event
from .schemas import ItemEvent

log = logging.getLogger("rag.consumer")


async def run_consumer(stop: asyncio.Event) -> None:
    s = get_settings()
    consumer = AIOKafkaConsumer(
        s.kafka_topic,
        bootstrap_servers=s.kafka_bootstrap,
        group_id=s.kafka_group,
        enable_auto_commit=False,          # commit only after a successful index
        auto_offset_reset="earliest",      # a fresh consumer group rebuilds the whole index
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    await consumer.start()
    log.info("consuming %s", s.kafka_topic)
    try:
        while not stop.is_set():
            batch = await consumer.getmany(timeout_ms=1000, max_records=100)
            for _tp, records in batch.items():
                for rec in records:
                    try:
                        value = rec.value
                        event = to_item_event(value) if is_board_event(value) else ItemEvent.model_validate(value)
                        await handle_event(event)
                    except (ValidationError, KeyError) as e:
                        log.warning("skipping malformed event at offset %s: %s", rec.offset, e)
            if batch:
                await consumer.commit()
    finally:
        await consumer.stop()
