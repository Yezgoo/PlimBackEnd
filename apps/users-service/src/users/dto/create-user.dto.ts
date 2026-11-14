import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  auth0Id!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsPhoneNumber()   // international format, e.g. +351912345678
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  privacyVersion?: string;
}
