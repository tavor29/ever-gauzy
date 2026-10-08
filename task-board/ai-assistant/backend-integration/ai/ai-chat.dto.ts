import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class ChatTurnDto {
	@IsIn(['user', 'assistant'])
	role!: 'user' | 'assistant';

	@IsString()
	@MaxLength(4000)
	content!: string;
}

export class AiChatDto {
	@IsString()
	user_id!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(2000)
	query!: string;

	@IsString()
	board_id!: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(12)
	@ValidateNested({ each: true })
	@Type(() => ChatTurnDto)
	history?: ChatTurnDto[];
}
