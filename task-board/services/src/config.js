/** All settings come from environment variables, with defaults that match docker-compose.yml. */
const env = process.env;

export const config = {
	databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gauzy',
	kafkaBrokers: (env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
	topic: env.BOARD_EVENTS_TOPIC ?? 'board.task-events',

	relayBatch: Number(env.RELAY_BATCH ?? 100),
	relayIdleMs: Number(env.RELAY_IDLE_MS ?? 500),

	rulesFile: env.RULES_FILE ?? new URL('../rules.json', import.meta.url).pathname,
	smtpUrl: env.SMTP_URL ?? 'smtp://localhost:1025',
	mailFrom: env.MAIL_FROM ?? 'Task Board <board@localhost>',

	livePort: Number(env.LIVE_BOARD_PORT ?? 8090),
	liveSecret: env.LIVE_BOARD_SECRET ?? '',
	liveMaxConnectionMs: Number(env.LIVE_MAX_CONNECTION_MS ?? 15 * 60_000)
};
