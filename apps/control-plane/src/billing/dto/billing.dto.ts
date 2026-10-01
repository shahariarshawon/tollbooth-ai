import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateBillingPlanDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyBudgetLimit!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyBudgetLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  requestsPerMinute?: number = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  requestsPerDay?: number = 10000;

  @IsOptional()
  @IsInt()
  @Min(1)
  tokensPerMinute?: number = 100000;

  @IsOptional()
  @IsInt()
  @Min(1)
  tokensPerDay?: number = 5000000;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[] = [];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class AssignSubscriptionDto {
  @IsString()
  planCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyBudgetLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyBudgetLimit?: number;
}

export class UpdateBillingLimitsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monthlyBudgetLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyBudgetLimit?: number;
}
