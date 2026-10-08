/**
 * The live board's memory: the latest version of every task, grouped by board (Gauzy project),
 * plus the browsers watching each board. Rebuilt from Kafka on start-up, so it needs no database.
 */
export class BoardState {
	constructor() {
		this.boards = new Map(); // boardId -> Map(taskId -> task)
		this.watchers = new Map(); // boardId -> Set(send function)
		this.seen = new Set(); // recent event ids, to drop repeated deliveries
	}

	/** Applies one task event and tells the watchers of every board it touches. */
	apply(event) {
		if (this.seen.has(event.event_id)) return;
		this.seen.add(event.event_id);
		if (this.seen.size > 10_000) this.seen.delete(this.seen.values().next().value);

		const task = { ...event.task, board_id: event.project_id, updated_at: event.occurred_at };
		const movedFrom = event.changes?.project_id?.from;

		// A task moved to another project leaves the old board.
		if (movedFrom && movedFrom !== event.project_id) this.remove(movedFrom, task.id);

		if (event.type === 'task.deleted') {
			if (event.project_id) this.remove(event.project_id, task.id);
			return;
		}
		if (!event.project_id) return; // tasks outside a project are not on any board
		this.board(event.project_id).set(task.id, task);
		this.broadcast(event.project_id, 'task', { task, changes: event.changes ?? {}, actor_user_id: event.actor_user_id });
	}

	remove(boardId, taskId) {
		if (this.boards.get(boardId)?.delete(taskId)) this.broadcast(boardId, 'removed', { task_id: taskId });
	}

	snapshot(boardId) {
		return [...(this.boards.get(boardId)?.values() ?? [])];
	}

	watch(boardId, send) {
		if (!this.watchers.has(boardId)) this.watchers.set(boardId, new Set());
		this.watchers.get(boardId).add(send);
		return () => this.watchers.get(boardId)?.delete(send);
	}

	board(id) {
		if (!this.boards.has(id)) this.boards.set(id, new Map());
		return this.boards.get(id);
	}

	broadcast(boardId, type, data) {
		for (const send of this.watchers.get(boardId) ?? []) send(type, data);
	}
}
