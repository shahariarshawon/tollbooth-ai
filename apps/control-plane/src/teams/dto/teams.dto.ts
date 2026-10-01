import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { TeamMemberRole } from '@tollbooth/database';

export class CreateTeamDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rateLimitRpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rateLimitRpd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenLimitTpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenLimitTpd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyBudget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyBudget?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModels?: string[];
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rateLimitRpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rateLimitRpd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenLimitTpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenLimitTpd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyBudget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyBudget?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModels?: string[];
}

export class AddTeamMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole = TeamMemberRole.MEMBER;
}
