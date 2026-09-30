import { applyDecorators } from '@nestjs/common';
import { IsString, IsStrongPassword, MaxLength } from 'class-validator';

/**
 * Password policy: at least 8 characters with an uppercase letter, a lowercase letter and a number.
 * The 72 character cap matches bcrypt, which ignores anything beyond 72 bytes.
 */
export const IsValidPassword = () =>
  applyDecorators(
    IsString(),
    MaxLength(72),
    IsStrongPassword(
      { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 },
      {
        message:
          'password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number',
      },
    ),
  );
