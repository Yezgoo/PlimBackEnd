import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetAreasDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(/^\d{4}$/, { each: true, message: 'each municipality code must be 4 digits, e.g. 0603' })
  municipalityCodes!: string[];
}

export class SetServicesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serviceTypeIds!: string[];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00 to 23:59

export class SlotDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number; // 1 = Monday ... 7 = Sunday

  @Matches(TIME, { message: 'start must be a time like 09:00' })
  start!: string;

  @Matches(TIME, { message: 'end must be a time like 18:00' })
  end!: string;
}

// The whole weekly timetable at once: what is sent replaces what was there
export class SetAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(28) // up to 4 blocks a day
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots!: SlotDto[];
}

export class AddTimeOffDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
