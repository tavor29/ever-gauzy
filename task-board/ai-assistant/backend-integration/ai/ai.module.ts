import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { BoardAccessService } from './board-access.service';

@Module({
	controllers: [AiController],
	providers: [AiService, BoardAccessService],
	exports: [AiService]
})
export class AiModule {}
