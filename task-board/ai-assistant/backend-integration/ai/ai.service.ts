import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BoardAccessService } from './board-access.service';

const RAG_URL = process.env.RAG_URL ?? 'http://rag:8088';
const RAG_TOKEN = process.env.RAG_SERVICE_TOKEN ?? '';

@Injectable()
export class AiService {
	constructor(private readonly access: BoardAccessService) {}

	/** Resolves the user's permissions, then asks the RAG service. Returns the SSE body stream. */
	async chat(userId: string, query: string, boardId: string, history: { role: string; content: string }[]) {
		const scope = await this.access.readableScope(userId);
		if (!scope.boardIds.includes(boardId)) {
			throw new ForbiddenException('No access to this board');
		}

		const res = await fetch(`${RAG_URL}/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RAG_TOKEN}` },
			body: JSON.stringify({
				principal: { user_id: userId, workspace_ids: scope.workspaceIds, board_ids: scope.boardIds },
				query,
				board_id: boardId,
				history
			})
		});
		if (!res.ok || !res.body) {
			throw new ServiceUnavailableException('AI assistant unavailable');
		}
		return res.body;
	}

	/** Called by the app's event hooks (or replaced by the Kafka topic) whenever an item changes. */
	async index(events: unknown[]): Promise<void> {
		await fetch(`${RAG_URL}/index`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RAG_TOKEN}` },
			body: JSON.stringify(events)
		});
	}
}
