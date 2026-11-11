import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNif } from '../nif.js';

// What a professional may change about their own profile.
export class UpdateProfessionalDto {
  // only while the application is still waiting: after approval the NIF was checked against documents
  @IsOptional()
  @IsNif()
  nif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  insurancePolicy?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'insuranceValidUntil must be a date like 2027-12-31' })
  insuranceValidUntil?: string;
}
