import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A short-lived pass to watch one board on the live board service.
 * Gauzy checks the user's permissions and signs the pass; the live board only checks the signature,
 * so it never needs its own copy of the permission rules or access to Gauzy's database.
 * The live board service has the same code in JavaScript (services/live-board/src/ticket.js).
 */
export interface LiveTicket {
	user_id: string;
	board_id: string;
	exp: number; // unix seconds
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signTicket(t: LiveTicket, secret: string): string {
	const body = b64(JSON.stringify(t));
	const sig = createHmac('sha256', secret).update(body).digest('base64url');
	return `${body}.${sig}`;
}

export function verifyTicket(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): LiveTicket | null {
	const [body, sig] = token.split('.');
	if (!body || !sig) return null;
	const expected = createHmac('sha256', secret).update(body).digest();
	const given = Buffer.from(sig, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as LiveTicket;
	return t.exp > nowSec ? t : null;
}
