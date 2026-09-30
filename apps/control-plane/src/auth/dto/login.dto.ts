import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Normalize } from '../../common/dto/transforms';

export class LoginDto {
  @Normalize()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Deliberately no strength rules here: login must accept whatever was stored. The length cap
  // bounds the work bcrypt does per request.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
