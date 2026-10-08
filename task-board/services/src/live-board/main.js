/**
 * Live board service: pushes task changes to browsers as they happen.
 *
 *   GET /                      the demo board page
 *   GET /stream?ticket=...     server-sent events for one board: a snapshot, then every change
 *   GET /healthz
 *
 * The ticket is a 60-second pass from Gauzy (GET /api/live-board/ticket), so this service never
 * decides permissions. Connections close after LIVE_MAX_CONNECTION_MS and the page fetches a
 * new pass, so someone removed from a project stops receiving updates within that time.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { kafka, onShutdown } from '../kafka.js';
import { BoardState } from './board-state.js';
import { verifyTicket } from './ticket.js';

const page = readFileSync(new URL('./public/index.html', import.meta.url));

export function createServer(state, { secret, maxConnectionMs }) {
	return http.createServer((req, res) => {
		const url = new URL(req.url, 'http://local');

		if (url.pathname === '/healthz') return res.end('ok');
		if (url.pathname === '/') {
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			return res.end(page);
		}
		if (url.pathname !== '/stream') {
			res.statusCode = 404;
			return res.end();
		}

		const ticket = verifyTicket(url.searchParams.get('ticket'), secret);
		if (!ticket) {
			res.statusCode = 401;
			return res.end('ticket missing, expired or invalid');
		}

		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		});
		const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
		send('snapshot', { board_id: ticket.board_id, tasks: state.snapshot(ticket.board_id) });

		const unwatch = state.watch(ticket.board_id, send);
		const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
		const expire = setTimeout(() => {
			send('reauth', {});
			res.end();
		}, maxConnectionMs);
		req.on('close', () => {
			unwatch();
			clearInterval(ping);
			clearTimeout(expire);
		});
	});
}

async function main() {
	if (!config.liveSecret) throw new Error('LIVE_BOARD_SECRET is required (the same value Gauzy uses)');
	const state = new BoardState();

	// A fresh consumer group per process that starts from the beginning of the topic:
	// every instance replays the history to rebuild the boards, then follows new events.
	const consumer = kafka('live-board').consumer({ groupId: `live-board-${randomUUID()}` });
	await consumer.connect();
	await consumer.subscribe({ topic: config.topic, fromBeginning: true });
	await consumer.run({
		eachMessage: async ({ message }) => {
			try {
				state.apply(JSON.parse(message.value.toString()));
			} catch (err) {
				console.warn('live-board: skipping bad message:', err.message);
			}
		}
	});

	const server = createServer(state, { secret: config.liveSecret, maxConnectionMs: config.liveMaxConnectionMs });
	server.listen(config.livePort, () => console.log(`live-board: http://localhost:${config.livePort}`));
	onShutdown(async () => {
		server.close();
		await consumer.disconnect();
	});
}

if (import.meta.url === `file://${process.argv[1]}`) main();
