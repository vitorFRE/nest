import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../../common/transformers/normalize-email.transformer';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    format: 'password',
    maxLength: 72,
    description: 'Máximo de 72 bytes UTF-8 (bcrypt).',
  })
  @IsString()
  @MinLength(1)
  @IsByteLength(1, 72)
  password: string;
}
