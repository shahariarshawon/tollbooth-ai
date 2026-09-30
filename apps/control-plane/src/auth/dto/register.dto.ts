import { IsEmail, IsNotEmpty, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Normalize, SLUG_PATTERN, Trim } from '../../common/dto/transforms';
import { IsValidPassword } from './password.decorator';

/** Self-service sign-up: creates a tenant and its first TENANT_ADMIN user. */
export class RegisterDto {
  @Normalize()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsValidPassword()
  password!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  @Normalize()
  @IsString()
  @Length(2, 63)
  @Matches(SLUG_PATTERN, {
    message: 'tenantSlug may only contain lowercase letters, numbers and inner hyphens',
  })
  tenantSlug!: string;
}
