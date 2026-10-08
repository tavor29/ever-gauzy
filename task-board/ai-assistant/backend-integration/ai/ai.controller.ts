import { Body, Controller, ForbiddenException, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { AiChatDto } from './ai-chat.dto';
import { AiService } from './ai.service';
// Replace with the app's real auth guard (in Ever Gauzy, the JWT/tenant guards used on other controllers).
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/ai')
@UseGuards(AuthGuard)
export class AiController {
	constructor(private readonly ai: AiService) {}

	/**
	 * POST /api/ai/chat
	 * Body: { user_id, query, board_id }  ->  text/event-stream
	 *   event: sources  data: [{ item_id, title, board_id }]
	 *   event: token    data: "partial text"
	 *   event: error    data: "message"
	 *   event: done     data: {}
	 */
	@Post('chat')
	async chat(@Body() dto: AiChatDto, @Req() req: Request, @Res() res: Response): Promise<void> {
		// Identity comes from the login session, never from the payload.
		const sessionUserId: string = (req as any).user?.id;
		if (!sessionUserId || dto.user_id !== sessionUserId) {
			throw new ForbiddenException('user_id does not match the signed-in user');
		}

		const upstream = await this.ai.chat(sessionUserId, dto.query, dto.board_id, dto.history ?? []);

		res.status(200);
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('X-Accel-Buffering', 'no'); // stop nginx from buffering the stream
		res.flushHeaders();

		const stream = Readable.fromWeb(upstream as any);
		req.on('close', () => stream.destroy()); // user closed the widget: stop generating
		stream.pipe(res);
	}
}
