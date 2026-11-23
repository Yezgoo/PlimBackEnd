import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Professional } from '../generated/prisma/client.js';
import { ApplyProfessionalDto } from './dto/apply-professional.dto.js';
import { UpdateProfessionalDto } from './dto/update-professional.dto.js';

// "2027-12-31" → a Date (the column only keeps the day)
const toDate = (day?: string) => (day ? new Date(day) : undefined);

@Injectable()
export class ProfessionalsService {
  constructor(private readonly prisma: PrismaService) {}

  // A registered user applies to work on the platform. Starts as "applied"; an admin approves later.
  async apply(auth0Id: string, dto: ApplyProfessionalDto) {
    const user = await this.prisma.user.findUnique({ where: { auth0Id }, select: { id: true } });
    if (!user) throw new NotFoundException(`No user linked to ${auth0Id}`);

    try {
      const professional = await this.prisma.professional.create({
        data: { ...dto, insuranceValidUntil: toDate(dto.insuranceValidUntil), userId: user.id },
      });
      return this.present(professional);
    } catch (e) {
      throw this.asConflict(e);
    }
  }

  async findByAuth0Id(auth0Id: string) {
    const professional = await this.prisma.professional.findFirst({ where: { user: { auth0Id } } });
    if (!professional) throw new NotFoundException(`${auth0Id} has not applied as a professional`);
    return this.present(professional);
  }

  async update(auth0Id: string, dto: UpdateProfessionalDto) {
    const current = await this.prisma.professional.findFirst({ where: { user: { auth0Id } } });
    if (!current) throw new NotFoundException(`${auth0Id} has not applied as a professional`);

    if (dto.nif && dto.nif !== current.nif && current.status !== 'applied') {
      throw new ConflictException('The NIF can only be changed while the application is waiting for approval');
    }

    try {
      const professional = await this.prisma.professional.update({
        where: { id: current.id },
        data: {
          ...dto,
          insuranceValidUntil: toDate(dto.insuranceValidUntil),
          // fixing a rejected application sends it back to the admins' queue
          ...(current.status === 'rejected' ? { status: 'applied', rejectionReason: null } : {}),
        },
      });
      return this.present(professional);
    } catch (e) {
      throw this.asConflict(e);
    }
  }

  // P2002 = unique constraint: this user already applied, or the NIF belongs to another professional
  private asConflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const fields = String(e.meta?.target ?? '');
      return new ConflictException(
        fields.includes('nif')
          ? 'This NIF is already registered to a professional'
          : 'This user has already applied as a professional',
      );
    }
    return e;
  }

  // Plain values for JSON: the date as "2027-12-31", the rating as a number.
  // Which admin reviewed the application stays internal.
  // So do the storage paths of the photo: the app only learns whether there is one.
  private present({ reviewedBy: _reviewedBy, photoKey, photoUploadKey: _photoUploadKey, ...professional }: Professional) {
    return {
      ...professional,
      hasPhoto: !!photoKey,
      insuranceValidUntil: professional.insuranceValidUntil?.toISOString().slice(0, 10) ?? null,
      ratingAvg: professional.ratingAvg === null ? null : Number(professional.ratingAvg),
    };
  }
}
