import { Equals, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNif } from '../nif.js';

// What a person sends to apply as a professional.
// status, verifiedAt and ratings are not here on purpose: only admins and the system set them.
export class ApplyProfessionalDto {
  @IsNif()
  nif!: string;

  // "Atividade aberta" at the tax office. A pro can't be paid without it, so it must be declared.
  @Equals(true, { message: 'activityRegistered must be true: an open activity (atividade aberta) is required' })
  activityRegistered!: boolean;

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
