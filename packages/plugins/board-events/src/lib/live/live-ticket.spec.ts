import { signTicket, verifyTicket } from './live-ticket';

describe('live tickets', () => {
	const t = { user_id: 'u1', board_id: 'b1', exp: 2_000 };

	it('round-trips with the right secret', () => {
		expect(verifyTicket(signTicket(t, 's'), 's', 1_000)).toEqual(t);
	});
	it('rejects a wrong secret, a tampered body and an expired pass', () => {
		const tok = signTicket(t, 's');
		expect(verifyTicket(tok, 'other', 1_000)).toBeNull();
		const forged = Buffer.from(JSON.stringify({ ...t, board_id: 'b2' })).toString('base64url') + '.' + tok.split('.')[1];
		expect(verifyTicket(forged, 's', 1_000)).toBeNull();
		expect(verifyTicket(tok, 's', 3_000)).toBeNull();
	});
});
