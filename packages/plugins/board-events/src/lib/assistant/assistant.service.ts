import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RequestContext } from '@gauzy/core';
import { BoardAccessService } from '../access/board-access.service';
import { AssistantChatDto } from './assistant-chat.dto';

const RAG_URL = process.env['RAG_URL'] ?? 'http://rag:8088';
const RAG_TOKEN = process.env['RAG_SERVICE_TOKEN'] ?? '';

/**
 * Bridges Gauzy to the private assistant (task-board/ai-assistant/services/rag).
 * Gauzy decides who the user is and which boards they may read; the RAG service only searches
 * inside that list. Task content reaches the assistant's index through Kafka, not through here.
 */
@Injectable()
export class AssistantService {
	constructor(private readonly access: BoardAccessService) {}

	async chat(dto: AssistantChatDto): Promise<ReadableStream<Uint8Array>> {
		const scope = await this.access.readableScope();
		if (!scope.boardIds.includes(dto.board_id)) {
			throw new ForbiddenException('No access to this board');
		}

		const res = await fetch(`${RAG_URL}/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RAG_TOKEN}` },
			body: JSON.stringify({
				principal: {
					user_id: RequestContext.currentUserId(),
					workspace_ids: scope.workspaceIds,
					board_ids: scope.boardIds
				},
				query: dto.query,
				board_id: dto.board_id,
				history: dto.history ?? []
			})
		}).catch(() => null);
		if (!res?.ok || !res.body) {
			throw new ServiceUnavailableException('AI assistant unavailable');
		}
		return res.body;
	}
}
