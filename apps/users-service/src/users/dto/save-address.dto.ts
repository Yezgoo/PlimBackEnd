import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// The same address fields a booking takes, plus the name the person gives it
export class SaveAddressDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label!: string; // "Casa", "Trabalho", "Mãe"

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  details?: string;

  @Matches(/^\d{4}-\d{3}$/, { message: 'postalCode must look like 3000-123' })
  postalCode!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;
}
