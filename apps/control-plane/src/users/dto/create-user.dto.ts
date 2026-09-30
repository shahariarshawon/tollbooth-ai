import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsValidPassword } from '../../auth/dto/password.decorator';
import { Normalize, Trim } from '../../common/dto/transforms';

/** Roles a tenant admin may assign. SUPER_ADMIN is platform staff and is never created through the API. */
export const ASSIGNABLE_ROLES = ['TENANT_ADMIN', 'DEVELOPER', 'FINANCE'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateUserDto {
  @Normalize()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Temporary password chosen by the inviting admin; there is no email flow yet. */
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

  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}
