/**
 * Looks up who an action goes to, read-only, in Gauzy's database.
 * Gauzy stays the source of truth for people and roles; this service keeps no copy.
 */
export async function findRecipients(db, to, event) {
	if (to === 'task.owner') {
		if (!event.task.created_by_user_id) return [];
		const { rows } = await db.query(
			`SELECT email, COALESCE(NULLIF("firstName", ''), email) AS name FROM "user"
			 WHERE id = $1 AND "tenantId" = $2 AND email IS NOT NULL AND "deletedAt" IS NULL`,
			[event.task.created_by_user_id, event.tenant_id]
		);
		return rows;
	}
	if (to === 'project.managers') {
		if (!event.project_id) return [];
		const { rows } = await db.query(
			`SELECT DISTINCT u.email, COALESCE(NULLIF(u."firstName", ''), u.email) AS name
			 FROM "organization_project_employee" m
			 JOIN "employee" e ON e.id = m."employeeId"
			 JOIN "user" u ON u.id = e."userId"
			 WHERE m."organizationProjectId" = $1 AND m."tenantId" = $2
			   AND m."isManager" = true AND m."isActive" = true AND m."deletedAt" IS NULL
			   AND u.email IS NOT NULL AND u."deletedAt" IS NULL`,
			[event.project_id, event.tenant_id]
		);
		return rows;
	}
	return [];
}
