import { Injectable } from '@nestjs/common';

export interface ReadableScope {
	workspaceIds: string[];
	boardIds: string[];
}

/**
 * The single source of truth for "what may this user read".
 * Implement it with the same permission queries the board UI already uses, so the
 * assistant can never see more than the user could open themselves.
 *
 * In Ever Gauzy a likely mapping is workspace -> organization (within a tenant)
 * and board -> project; confirm against the app's own entities.
 */
@Injectable()
export class BoardAccessService {
	async readableScope(userId: string): Promise<ReadableScope> {
		// TODO: replace with real queries, e.g. memberships joined to boards, minus private boards
		// the user is not a member of. Cache briefly (~30 s) and invalidate on membership changes.
		throw new Error(`readableScope not implemented for user ${userId}`);
	}
}
