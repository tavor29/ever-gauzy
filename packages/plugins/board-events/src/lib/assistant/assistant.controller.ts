import { Body, Controller, Post, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { PermissionsEnum } from '@gauzy/contracts';
import { PermissionGuard, Permissions, TenantPermissionGuard } from '@gauzy/core';
import { AssistantChatDto } from './assistant-chat.dto';
import { AssistantService } from './assistant.service';

@UseGuards(TenantPermissionGuard, PermissionGuard)
@Permissions(PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ORG_TASK_VIEW)
@Controller('/private-assistant')
export class AssistantController {
	constructor(private readonly assistant: AssistantService) {}

	/**
	 * POST /api/private-assistant/chat
	 * Body: { query, board_id, history? }  ->  text/event-stream
	 *   event: sources  data: [{ item_id, title, board_id }]
	 *   event: token    data: "partial text"
	 *   event: error    data: "message"
	 *   event: done     data: {}
	 * The user is always the signed-in user; the body cannot name someone else.
	 */
	@Post('/chat')
	@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
	async chat(@Body() dto: AssistantChatDto, @Req() req: Request, @Res() res: Response): Promise<void> {
		const upstream = await this.assistant.chat(dto);

		res.status(200);
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('X-Accel-Buffering', 'no'); // stop nginx from buffering the stream
		res.flushHeaders();

		const stream = Readable.fromWeb(upstream as any);
		req.on('close', () => stream.destroy()); // user closed the chat: stop generating
		stream.pipe(res);
	}
}
