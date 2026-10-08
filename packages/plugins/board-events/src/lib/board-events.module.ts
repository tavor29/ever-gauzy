import { Module } from '@nestjs/common';
import { BoardAccessService } from './access/board-access.service';
import { AssistantController } from './assistant/assistant.controller';
import { AssistantService } from './assistant/assistant.service';
import { LiveBoardController } from './live/live-board.controller';

@Module({
	controllers: [AssistantController, LiveBoardController],
	providers: [BoardAccessService, AssistantService],
	exports: [BoardAccessService]
})
export class BoardEventsModule {}
