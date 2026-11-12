import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// The service as it is in the catalog right now. The gateway reads it from catalog-service,
// so the price is never something the customer's app sent.
export class BookedServiceDto {
  @IsUUID()
  id!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(15)
  @Max(24 * 60)
  durationMinutes!: number;

  @IsInt()
  @Min(1)
  priceCents!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate!: number;
}

export class BookingAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string; // street and door number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  details?: string; // floor, side, how to find the door

  @Matches(/^\d{4}-\d{3}$/, { message: 'postalCode must look like 3000-123' })
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;
}

export class CreateBookingDto {
  @IsUUID()
  customerId!: string; // users-service user id, resolved by the gateway from the token

  @ValidateNested()
  @Type(() => BookedServiceDto)
  service!: BookedServiceDto;

  @ValidateNested()
  @Type(() => BookingAddressDto)
  address!: BookingAddressDto;

  @Matches(/^\d{4}$/)
  municipalityCode!: string; // from the postal code, checked by the gateway against the catalog

  @IsDateString()
  scheduledStart!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
