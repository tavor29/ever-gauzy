/**
 * The outbox table. A task change and its event row are written in the same database
 * transaction, so an event can never be lost or sent for a change that was rolled back.
 * The outbox relay service reads unpublished rows and sends them to Kafka.
 */
export const OUTBOX_TABLE = 'board_outbox';

export const CREATE_OUTBOX_SQL = `
CREATE TABLE IF NOT EXISTS ${OUTBOX_TABLE} (
	id            BIGSERIAL PRIMARY KEY,
	event_id      UUID        NOT NULL UNIQUE,
	topic         TEXT        NOT NULL,
	message_key   TEXT        NOT NULL,
	payload       JSONB       NOT NULL,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
	published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ${OUTBOX_TABLE}_unpublished ON ${OUTBOX_TABLE} (id) WHERE published_at IS NULL;
`;

export const INSERT_OUTBOX_SQL = `INSERT INTO ${OUTBOX_TABLE} (event_id, topic, message_key, payload) VALUES ($1, $2, $3, $4)`;

export const TASK_TOPIC = process.env['BOARD_EVENTS_TOPIC'] || 'board.task-events';
