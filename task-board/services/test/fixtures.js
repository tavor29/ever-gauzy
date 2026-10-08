let n = 0;
export function taskEvent(overrides = {}) {
	n += 1;
	return {
		version: 1,
		event_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
		type: 'task.updated',
		occurred_at: '2026-10-08T12:00:00.000Z',
		tenant_id: 'ten',
		organization_id: 'org',
		project_id: 'p1',
		actor_user_id: 'u2',
		task: { id: 't1', title: 'Payments migration', status: 'done', created_by_user_id: 'u1' },
		changes: { status: { from: 'in-progress', to: 'done' } },
		...overrides
	};
}
