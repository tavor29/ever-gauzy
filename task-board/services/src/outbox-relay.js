/**
 * Outbox relay: moves task events from Gauzy's board_outbox table to Kafka.
 *
 * Loop: lock a batch of unpublished rows, send them to Kafka, mark them published, commit.
 * If Kafka is down nothing is marked, so the rows are sent once it is back (at-least-once:
 * consumers may see an event twice and use event_id to ignore repeats).
 * Several relays can run side by side; SKIP LOCKED gives each its own rows.
 */
import pg from 'pg';
import { config } from './config.js';
import { kafka, onShutdown, partitioner } from './kafka.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
const producer = kafka('outbox-relay').producer({ idempotent: true, maxInFlightRequests: 1, createPartitioner: partitioner });

export async function relayOnce(db, send, batchSize = config.relayBatch) {
	const client = await db.connect();
	try {
		await client.query('BEGIN');
		const { rows } = await client.query(
			`SELECT id, topic, message_key, payload FROM board_outbox
			 WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
			[batchSize]
		);
		if (rows.length) {
			await send(rows);
			await client.query('UPDATE board_outbox SET published_at = now() WHERE id = ANY($1)', [rows.map((r) => r.id)]);
		}
		await client.query('COMMIT');
		return rows.length;
	} catch (err) {
		await client.query('ROLLBACK').catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}

async function sendToKafka(rows) {
	const byTopic = new Map();
	for (const r of rows) {
		if (!byTopic.has(r.topic)) byTopic.set(r.topic, []);
		// Key = task id, so all events for one task land on one partition, in order.
		byTopic.get(r.topic).push({ key: r.message_key, value: JSON.stringify(r.payload) });
	}
	await producer.sendBatch({ acks: -1, topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })) });
}

async function main() {
	await producer.connect();
	let running = true;
	onShutdown(async () => {
		running = false;
		await producer.disconnect();
		await pool.end();
	});
	console.log(`outbox-relay: board_outbox -> Kafka ${config.kafkaBrokers.join(',')}`);

	while (running) {
		try {
			const n = await relayOnce(pool, sendToKafka);
			if (n) console.log(`outbox-relay: published ${n} event(s)`);
			if (n < config.relayBatch) await sleep(config.relayIdleMs);
		} catch (err) {
			console.error('outbox-relay: will retry:', err.message);
			await sleep(2_000);
		}
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}`) main();
