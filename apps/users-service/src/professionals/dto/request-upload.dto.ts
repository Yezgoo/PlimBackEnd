import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DOCUMENT_TYPES = ['id_card', 'activity_proof', 'liability_insurance', 'certificate'] as const;

// What a phone camera or a scanner produces. The extension is ours, never taken from the file name.
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

// "I want to upload this file": the answer is a link to upload it to.
export class RequestUploadDto {
  @IsIn(DOCUMENT_TYPES)
  type!: (typeof DOCUMENT_TYPES)[number];

  @IsIn(Object.keys(ALLOWED_CONTENT_TYPES), { message: 'contentType must be application/pdf, image/jpeg or image/png' })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_BYTES, { message: 'The file must be 10 MB or smaller' })
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;
}
