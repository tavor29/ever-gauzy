import { EntityManager, EntitySubscriberInterface, EventSubscriber, InsertEvent, RemoveEvent, SoftRemoveEvent, UpdateEvent } from 'typeorm';
import { RequestContext, Task } from '@gauzy/core';
import { buildTaskEvent, TaskEventType } from './task-event';
import { INSERT_OUTBOX_SQL, TASK_TOPIC } from './outbox.sql';

/**
 * Writes one outbox row for every task create, update and delete.
 *
 * TypeORM calls these hooks inside the same transaction as the task write and hands us that
 * transaction's EntityManager, so the task and its event commit or roll back together.
 * This needs Gauzy's default ORM (DB_ORM=typeorm) on PostgreSQL.
 */
@EventSubscriber()
export class TaskOutboxSubscriber implements EntitySubscriberInterface<Task> {
	listenTo() {
		return Task;
	}

	async afterInsert(event: InsertEvent<Task>): Promise<void> {
		await this.write(event.manager, 'task.created', event.entity);
	}

	async afterUpdate(event: UpdateEvent<Task>): Promise<void> {
		if (!event.entity) return;
		// `entity` holds only what the caller saved; merge it over the loaded row to get the full task.
		const after = { ...(event.databaseEntity ?? {}), ...event.entity };
		await this.write(event.manager, 'task.updated', after, event.databaseEntity);
	}

	async afterSoftRemove(event: SoftRemoveEvent<Task>): Promise<void> {
		await this.write(event.manager, 'task.deleted', event.entity ?? event.databaseEntity);
	}

	async afterRemove(event: RemoveEvent<Task>): Promise<void> {
		const task = event.entity ?? event.databaseEntity;
		if (task && !task.id && event.entityId) (task as any).id = event.entityId;
		await this.write(event.manager, 'task.deleted', task);
	}

	private async write(manager: EntityManager, type: TaskEventType, task: any, before?: any): Promise<void> {
		if (!task?.id || !task.tenantId) return;
		const evt = buildTaskEvent(type, task, safeUserId(), before);
		await manager.query(INSERT_OUTBOX_SQL, [evt.event_id, TASK_TOPIC, task.id, JSON.stringify(evt)]);
	}
}

/** Background jobs (imports, syncs) run without a signed-in user. */
function safeUserId(): string | null {
	try {
		return RequestContext.currentUserId();
	} catch {
		return null;
	}
}
