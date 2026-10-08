import { Controller, ForbiddenException, Get, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { PermissionsEnum } from '@gauzy/contracts';
import { PermissionGuard, Permissions, RequestContext, TenantPermissionGuard, UUIDValidationPipe } from '@gauzy/core';
import { BoardAccessService } from '../access/board-access.service';
import { signTicket } from './live-ticket';

const TICKET_SECONDS = 60;

@UseGuards(TenantPermissionGuard, PermissionGuard)
@Permissions(PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ORG_TASK_VIEW)
@Controller('/live-board')
export class LiveBoardController {
	constructor(private readonly access: BoardAccessService) {}

	/**
	 * GET /api/live-board/ticket?boardId=...
	 * Returns a 60-second pass the browser uses to open the live board stream for one board.
	 */
	@Get('/ticket')
	async ticket(@Query('boardId', UUIDValidationPipe) boardId: string) {
		const secret = process.env['LIVE_BOARD_SECRET'];
		if (!secret) throw new ServiceUnavailableException('Live board is not configured');
		if (!(await this.access.canRead(boardId))) throw new ForbiddenException('No access to this board');

		const exp = Math.floor(Date.now() / 1000) + TICKET_SECONDS;
		const ticket = signTicket({ user_id: RequestContext.currentUserId(), board_id: boardId, exp }, secret);
		return { ticket, expiresAt: new Date(exp * 1000).toISOString() };
	}
}
