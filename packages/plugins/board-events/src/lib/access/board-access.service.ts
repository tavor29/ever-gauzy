import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermissionsEnum } from '@gauzy/contracts';
import { RequestContext } from '@gauzy/core';

export interface ReadableScope {
	/** Gauzy organizations the user belongs to ("workspaces" in the assistant). */
	workspaceIds: string[];
	/** Gauzy projects the user may open ("boards" in the assistant and live board). */
	boardIds: string[];
}

const CACHE_MS = 30_000;

/**
 * The single answer to "which boards may this user read". The AI assistant and the live board
 * both ask this service, so neither can show more than the user could open in Gauzy.
 *
 * Rules, mirroring Gauzy's own task screens:
 * - only organizations the user is an active member of, inside their tenant;
 * - managers and admins (CHANGE_SELECTED_EMPLOYEE) see every project in those organizations;
 * - everyone else sees projects where they are an active, non-archived project member.
 */
@Injectable()
export class BoardAccessService {
	private readonly cache = new Map<string, { at: number; scope: ReadableScope }>();

	constructor(@InjectDataSource() private readonly db: DataSource) {}

	async readableScope(): Promise<ReadableScope> {
		const userId = RequestContext.currentUserId();
		const tenantId = RequestContext.currentTenantId();
		if (!userId || !tenantId) return { workspaceIds: [], boardIds: [] };

		const seesAll = RequestContext.hasPermission(PermissionsEnum.CHANGE_SELECTED_EMPLOYEE);
		const employeeId = RequestContext.currentEmployeeId();
		const key = `${tenantId}:${userId}:${seesAll}`;
		const hit = this.cache.get(key);
		if (hit && Date.now() - hit.at < CACHE_MS) return hit.scope;

		const orgRows: { organizationId: string }[] = await this.db.query(
			`SELECT "organizationId" FROM "user_organization"
			 WHERE "userId" = $1 AND "tenantId" = $2 AND "isActive" = true AND "deletedAt" IS NULL`,
			[userId, tenantId]
		);
		const workspaceIds = orgRows.map((r) => r.organizationId);

		let boardIds: string[] = [];
		if (workspaceIds.length && seesAll) {
			const rows: { id: string }[] = await this.db.query(
				`SELECT "id" FROM "organization_project"
				 WHERE "tenantId" = $1 AND "organizationId" = ANY($2) AND "deletedAt" IS NULL`,
				[tenantId, workspaceIds]
			);
			boardIds = rows.map((r) => r.id);
		} else if (workspaceIds.length && employeeId) {
			const rows: { id: string }[] = await this.db.query(
				`SELECT p."id" FROM "organization_project" p
				 JOIN "organization_project_employee" m ON m."organizationProjectId" = p."id"
				 WHERE m."employeeId" = $1 AND m."isActive" = true AND m."isArchived" = false
				   AND m."deletedAt" IS NULL AND p."deletedAt" IS NULL
				   AND p."tenantId" = $2 AND p."organizationId" = ANY($3)`,
				[employeeId, tenantId, workspaceIds]
			);
			boardIds = rows.map((r) => r.id);
		}

		const scope = { workspaceIds, boardIds };
		this.cache.set(key, { at: Date.now(), scope });
		return scope;
	}

	async canRead(boardId: string): Promise<boolean> {
		return (await this.readableScope()).boardIds.includes(boardId);
	}
}
