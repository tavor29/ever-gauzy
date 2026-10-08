import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { BoardState } from '../src/live-board/board-state.js';
import { createServer } from '../src/live-board/main.js';
import { signTicket, verifyTicket } from '../src/live-board/ticket.js';
import { taskEvent } from './fixtures.js';

test('tickets: valid, wrong secret, tampered, expired', () => {
	const t = { user_id: 'u1', board_id: 'p1', exp: 2000 };
	const tok = signTicket(t, 's');
	assert.deepEqual(verifyTicket(tok, 's', 1000), t);
	assert.equal(verifyTicket(tok, 'x', 1000), null);
	const forged = Buffer.from(JSON.stringify({ ...t, board_id: 'p2' })).toString('base64url') + '.' + tok.split('.')[1];
	assert.equal(verifyTicket(forged, 's', 1000), null);
	assert.equal(verifyTicket(tok, 's', 3000), null);
	assert.equal(verifyTicket('garbage', 's', 1000), null);
});

test('board state: update, move between boards, delete, duplicates', () => {
	const s = new BoardState();
	const seen = { p1: [], p2: [] };
	s.watch('p1', (type, d) => seen.p1.push(type));
	s.watch('p2', (type, d) => seen.p2.push(type));

	const first = taskEvent();
	s.apply(first);
	s.apply(first); // repeated delivery
	assert.equal(s.snapshot('p1').length, 1);
	assert.deepEqual(seen.p1, ['task']);

	s.apply(taskEvent({ project_id: 'p2', changes: { project_id: { from: 'p1', to: 'p2' } } }));
	assert.equal(s.snapshot('p1').length, 0);
	assert.equal(s.snapshot('p2').length, 1);
	assert.deepEqual(seen.p1, ['task', 'removed']);

	s.apply(taskEvent({ type: 'task.deleted', project_id: 'p2', changes: {} }));
	assert.equal(s.snapshot('p2').length, 0);
});

test('stream: rejects a bad pass, sends a snapshot then live changes', async () => {
	const s = new BoardState();
	s.apply(taskEvent({ task: { id: 't9', title: 'Existing', status: 'open' } }));
	const server = createServer(s, { secret: 'k', maxConnectionMs: 60_000 });
	server.listen(0);
	await once(server, 'listening');
	const base = `http://127.0.0.1:${server.address().port}`;

	assert.equal((await fetch(`${base}/stream?ticket=nope`)).status, 401);

	const ticket = signTicket({ user_id: 'u1', board_id: 'p1', exp: Math.floor(Date.now() / 1000) + 60 }, 'k');
	const ac = new AbortController();
	const res = await fetch(`${base}/stream?ticket=${ticket}`, { signal: ac.signal });
	const reader = res.body.getReader();
	const read = async () => new TextDecoder().decode((await reader.read()).value);

	assert.match(await read(), /event: snapshot\ndata: .*"Existing"/);
	s.apply(taskEvent({ task: { id: 't9', title: 'Existing', status: 'done' } }));
	assert.match(await read(), /event: task\ndata: .*"status":"done"/);

	ac.abort();
	server.close();
});
