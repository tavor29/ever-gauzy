import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayOnce } from '../src/outbox-relay.js';

function fakePool(rows) {
	const log = [];
	const client = {
		async query(sql, params) {
			log.push(sql.trim().split(/\s+/)[0]);
			if (sql.startsWith('SELECT')) return { rows };
			if (sql.startsWith('UPDATE')) for (const r of rows) if (params[0].includes(r.id)) r.published = true;
			return { rows: [] };
		},
		release() {}
	};
	return { log, pool: { connect: async () => client } };
}

test('publishes then marks rows, in one transaction', async () => {
	const rows = [{ id: 1, topic: 't', message_key: 'k', payload: {} }];
	const { log, pool } = fakePool(rows);
	const sent = [];
	assert.equal(await relayOnce(pool, async (r) => sent.push(...r), 10), 1);
	assert.equal(sent.length, 1);
	assert.equal(rows[0].published, true);
	assert.deepEqual(log, ['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
});

test('when Kafka fails nothing is marked and the rows stay for the next try', async () => {
	const rows = [{ id: 1, topic: 't', message_key: 'k', payload: {} }];
	const { log, pool } = fakePool(rows);
	await assert.rejects(relayOnce(pool, async () => { throw new Error('kafka down'); }, 10));
	assert.equal(rows[0].published, undefined);
	assert.deepEqual(log, ['BEGIN', 'SELECT', 'ROLLBACK']);
});
