import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

// reviewedBy is the admin's Auth0 id. The gateway fills it in from the token; it never comes from the admin's browser.

export class ApproveProfessionalDto {
  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;
}

export class RejectProfessionalDto {
  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;

  // shown to the applicant, so it must say what to fix
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ReviewDocumentDto {
  @IsString()
  @IsNotEmpty()
  reviewedBy!: string;

  @IsIn(['accepted', 'rejected'])
  decision!: 'accepted' | 'rejected';

  // required when rejecting: the pro needs to know what was wrong with the file
  @ValidateIf((dto: ReviewDocumentDto) => dto.decision === 'rejected')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
