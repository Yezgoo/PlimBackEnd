import { PrismaService } from '../database/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserDto) {

    try {
      return await this.prisma.user.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email or Auth0 id already exists');
      }
      throw e; // anything else is a real, unexpected error → let it be a 500
    }
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}