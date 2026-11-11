import { IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

// Only what a person may change about themselves. Email and Auth0 id come from Auth0, not from here.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsPhoneNumber()   // international format, e.g. +351912345678
  phone?: string;
}
