import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GauzyCorePlugin as Plugin, IOnPluginBootstrap } from '@gauzy/plugin';
import { BoardEventsModule } from './board-events.module';
import { CREATE_OUTBOX_SQL } from './outbox/outbox.sql';
import { TaskOutboxSubscriber } from './outbox/task-outbox.subscriber';

/**
 * Everything this project adds to Gauzy, in one plugin:
 * - every task change also writes an event row (the outbox) in the same transaction;
 * - one permission check ("which boards may this user read") shared by the AI assistant and the live board;
 * - POST /api/private-assistant/chat and GET /api/live-board/ticket.
 * Kafka, automations, the live board and the AI stack run as separate services.
 */
@Plugin({
	imports: [BoardEventsModule],
	subscribers: [TaskOutboxSubscriber]
})
export class BoardEventsPlugin implements IOnPluginBootstrap {
	private readonly logger = new Logger(BoardEventsPlugin.name);

	constructor(private readonly db: DataSource) {}

	async onPluginBootstrap(): Promise<void> {
		await this.db.query(CREATE_OUTBOX_SQL);
		this.logger.log('board_outbox table ready');
	}
}
