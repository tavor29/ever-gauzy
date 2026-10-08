import { randomUUID } from 'node:crypto';

export type TaskEventType = 'task.created' | 'task.updated' | 'task.deleted';

/** The fields of a Gauzy task that leave the app. Anything not listed here stays in Gauzy. */
export interface TaskSnapshot {
	id: string;
	number: number | null;
	prefix: string | null;
	title: string;
	description: string;
	status: string | null;
	priority: string | null;
	due_date: string | null;
	created_by_user_id: string | null;
}

/** One message on the board.task-events topic. Version it if the shape ever changes. */
export interface TaskEvent {
	version: 1;
	event_id: string;
	type: TaskEventType;
	occurred_at: string;
	tenant_id: string;
	organization_id: string;
	project_id: string | null;
	actor_user_id: string | null;
	task: TaskSnapshot;
	/** Only on task.updated: the tracked fields that changed, with old and new values. */
	changes: Record<string, { from: unknown; to: unknown }>;
}

/** Fields whose changes are reported in `changes`. Automations and the live board key off these. */
const TRACKED: Array<[keyof TaskSnapshot, string]> = [
	['status', 'status'],
	['title', 'title'],
	['priority', 'priority'],
	['due_date', 'dueDate'],
	['created_by_user_id', 'createdByUserId']
];

/** Gauzy stores descriptions as rich HTML; consumers get plain text. */
export function toPlainText(html: string | null | undefined): string {
	if (!html) return '';
	return html
		.replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function iso(value: unknown): string | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(value as string);
	return isNaN(d.getTime()) ? null : d.toISOString();
}

export function snapshot(task: any): TaskSnapshot {
	return {
		id: task.id,
		number: task.number ?? null,
		prefix: task.prefix ?? null,
		title: task.title ?? '',
		description: toPlainText(task.description),
		status: task.status ?? null,
		priority: task.priority ?? null,
		due_date: iso(task.dueDate),
		created_by_user_id: task.createdByUserId ?? null
	};
}

/**
 * Builds the event for a task change.
 * `before` is the row as it was in the database (updates only); without it no changes are reported,
 * so rules like "status became Done" stay quiet rather than guessing.
 */
export function buildTaskEvent(
	type: TaskEventType,
	task: any,
	actorUserId: string | null,
	before?: any,
	now: Date = new Date()
): TaskEvent {
	const after = snapshot(task);
	const changes: TaskEvent['changes'] = {};

	if (type === 'task.updated' && before) {
		const prev = snapshot(before);
		for (const [key] of TRACKED) {
			if (prev[key] !== after[key]) changes[key] = { from: prev[key], to: after[key] };
		}
		if ((before.projectId ?? null) !== (task.projectId ?? null)) {
			changes['project_id'] = { from: before.projectId ?? null, to: task.projectId ?? null };
		}
	}

	return {
		version: 1,
		event_id: randomUUID(),
		type,
		occurred_at: now.toISOString(),
		tenant_id: task.tenantId,
		organization_id: task.organizationId,
		project_id: task.projectId ?? null,
		actor_user_id: actorUserId,
		task: after,
		changes
	};
}
