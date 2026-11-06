import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_LETTER_AND_DIGIT,
  PASSWORD_POLICY_MESSAGE,
} from '../../../common/utils/password-policy';
import { NormalizeEmail } from '../../../common/transformers/normalize-email.transformer';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 72,
    description: PASSWORD_POLICY_MESSAGE,
  })
  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  @Matches(PASSWORD_LETTER_AND_DIGIT, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @ApiPropertyOptional({ example: 'Nome do usuário', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}
