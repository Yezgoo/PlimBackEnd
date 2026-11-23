import { IsIn, IsInt, Max, Min } from 'class-validator';

// A profile photo: what a phone camera or gallery produces. The extension is ours, never the file name's.
export const PHOTO_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export class RequestPhotoUploadDto {
  @IsIn(Object.keys(PHOTO_CONTENT_TYPES), { message: 'contentType must be image/jpeg or image/png' })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_BYTES, { message: 'The photo must be 5 MB or smaller' })
  sizeBytes!: number;
}
