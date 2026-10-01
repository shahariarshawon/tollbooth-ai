import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateGeneralSettingsDto {
  @IsOptional()
  @IsString()
  orgName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateSecuritySettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  passwordMinLength?: number;

  @IsOptional()
  @IsBoolean()
  requireSpecialChar?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultKeyExpiryDays?: number;
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  defaultProvider?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModels?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxInputTokens?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOutputTokens?: number;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsEmail()
  alertEmail?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  budgetThresholds?: number[];

  @IsOptional()
  @IsBoolean()
  notifyOnKeyRevoke?: boolean;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsObject()
  featureFlags?: Record<string, boolean>;
}
