import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'], {
    message: 'role must be one of: system, user, assistant',
  })
  role!: 'system' | 'user' | 'assistant';

  // Only plain text for now; structured content (images, tool calls) is rejected rather than ignored.
  @IsString({ message: 'content must be a string' })
  @MaxLength(200_000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;
}

/**
 * The subset of the OpenAI chat completions request the gateway supports. Field names are OpenAI's
 * (snake_case) so existing SDKs work unchanged. Anything else is rejected as an unknown parameter.
 */
export class ChatCompletionRequestDto {
  @IsString({ message: 'model is required and must be a string' })
  @IsNotEmpty({ message: 'model is required' })
  @MaxLength(100)
  model!: string;

  @IsArray({ message: 'messages is required and must be an array' })
  @ArrayMinSize(1, { message: 'messages must contain at least one message' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @IsNumber({}, { message: 'temperature must be a number' })
  @Min(0, { message: 'temperature must be between 0 and 2' })
  @Max(2, { message: 'temperature must be between 0 and 2' })
  temperature?: number;

  @IsOptional()
  @IsNumber({}, { message: 'top_p must be a number' })
  @Min(0, { message: 'top_p must be between 0 and 1' })
  @Max(1, { message: 'top_p must be between 0 and 1' })
  top_p?: number;

  // The per-deployment ceiling (GATEWAY_MAX_TOKENS) is enforced in the service.
  @IsOptional()
  @IsInt({ message: 'max_tokens must be an integer' })
  @Min(1, { message: 'max_tokens must be at least 1' })
  max_tokens?: number;

  // Several choices would multiply provider cost and complicate accounting, so only one is served.
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Only n = 1 is supported' })
  @Max(1, { message: 'Only n = 1 is supported' })
  n?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value))
  @IsArray({ message: 'stop must be a string or an array of strings' })
  @ArrayMaxSize(4, { message: 'stop can contain at most 4 sequences' })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  stop?: string[];

  @IsOptional()
  @IsNumber({}, { message: 'presence_penalty must be a number' })
  @Min(-2, { message: 'presence_penalty must be between -2 and 2' })
  @Max(2, { message: 'presence_penalty must be between -2 and 2' })
  presence_penalty?: number;

  @IsOptional()
  @IsNumber({}, { message: 'frequency_penalty must be a number' })
  @Min(-2, { message: 'frequency_penalty must be between -2 and 2' })
  @Max(2, { message: 'frequency_penalty must be between -2 and 2' })
  frequency_penalty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  user?: string;

  // Accepted so clients that always send it do not break; `true` is refused in the service.
  @IsOptional()
  @IsBoolean({ message: 'stream must be a boolean' })
  stream?: boolean;
}
