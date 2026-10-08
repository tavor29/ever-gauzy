import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleEvent } from '../src/automations/main.js';
import { validateRules } from '../src/automations/rules.js';
import { taskEvent } from './fixtures.js';

const rules = validateRules([
	{
		name: 'done',
		when: { event: 'task.updated', field: 'status', becomes: ['done'] },
		then: { action: 'email', to: 'task.owner', subject: 'Done: {{task.title}}', body: 'Hi {{recipient.name}}, {{change.from}} -> {{change.to}}' }
	}
]);

/** A stand-in for Postgres that knows the two tables the service touches. */
function fakeDb() {
	const runs = new Map();
	return {
		runs,
		async query(sql, params) {
			if (sql.includes('INSERT INTO automation_runs')) {
				const key = params[0] + params[1];
				if (runs.has(key)) return { rowCount: 0, rows: [] };
				runs.set(key, []);
				return { rowCount: 1, rows: [{}] };
			}
			if (sql.includes('UPDATE automation_runs')) return runs.set(params[0] + params[1], params[2]);
			if (sql.includes('DELETE FROM automation_runs')) return runs.delete(params[0] + params[1]);
			if (sql.includes('FROM "user"')) return { rows: [{ email: 'dana@example.org', name: 'Dana' }] };
			throw new Error('unexpected query ' + sql);
		}
	};
}

test('sends one email and records it', async () => {
	const db = fakeDb();
	const sent = [];
	const event = taskEvent();
	await handleEvent(event, { rules, db, send: async (m) => sent.push(m) });
	assert.deepEqual(sent, [{ to: 'dana@example.org', subject: 'Done: Payments migration', text: 'Hi Dana, in-progress -> done' }]);
	assert.deepEqual([...db.runs.values()], [['dana@example.org']]);
});

test('a repeated delivery of the same event sends nothing', async () => {
	const db = fakeDb();
	const sent = [];
	const event = taskEvent();
	await handleEvent(event, { rules, db, send: async (m) => sent.push(m) });
	await handleEvent(event, { rules, db, send: async (m) => sent.push(m) });
	assert.equal(sent.length, 1);
});

test('a failed send is forgotten so the redelivery retries it', async () => {
	const db = fakeDb();
	const event = taskEvent();
	await assert.rejects(handleEvent(event, { rules, db, send: async () => { throw new Error('smtp down'); } }));
	assert.equal(db.runs.size, 0);
	const sent = [];
	await handleEvent(event, { rules, db, send: async (m) => sent.push(m) });
	assert.equal(sent.length, 1);
});
