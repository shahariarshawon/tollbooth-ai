import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rateLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
