import { TenantPlan } from '@tollbooth/database';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Normalize, SLUG_PATTERN, Trim } from '../../common/dto/transforms';

export class CreateTenantDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  @Normalize()
  @IsString()
  @Length(2, 63)
  @Matches(SLUG_PATTERN, {
    message: 'slug may only contain lowercase letters, numbers and inner hyphens',
  })
  slug!: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}

export class UpdateTenantDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName?: string;

  /** Super admin only. */
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  /** Super admin only. Use DELETE to retire a tenant. */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}
