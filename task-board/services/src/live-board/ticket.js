import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Checks a live board pass signed by Gauzy (packages/plugins/board-events/src/lib/live/live-ticket.ts).
 * Returns { user_id, board_id, exp } or null.
 */
export function verifyTicket(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
	if (!token || !secret) return null;
	const [body, sig] = String(token).split('.');
	if (!body || !sig) return null;
	const expected = createHmac('sha256', secret).update(body).digest();
	const given = Buffer.from(sig, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const t = JSON.parse(Buffer.from(body, 'base64url').toString());
		return t.exp > nowSec && t.board_id ? t : null;
	} catch {
		return null;
	}
}

/** Same as Gauzy's signTicket; used by tests and the local demo script. */
export function signTicket(t, secret) {
	const body = Buffer.from(JSON.stringify(t)).toString('base64url');
	return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
