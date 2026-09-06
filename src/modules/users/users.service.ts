import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate } from '../../common/utils/pagination';
import { userProfileSelect } from './user-profile';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async create(data: { email: string; name?: string; password: string }) {
    try {
      return await this.prisma.user.create({
        data: { ...data, email: data.email.trim().toLowerCase() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email já está em uso');
      }
      throw error;
    }
  }

  async findAll(query: PaginationQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: userProfileSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.user.count(),
    ]);
    return paginate(data, total, query);
  }

  async findByIdSafe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userProfileSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  updateRefreshToken(id: string, refreshToken: string | null) {
    return this.prisma.user.update({ where: { id }, data: { refreshToken } });
  }

  // Compare-and-swap: only one request may consume a refresh token.
  async rotateRefreshToken(id: string, previous: string, next: string) {
    const result = await this.prisma.user.updateMany({
      where: { id, refreshToken: previous, isActive: true },
      data: { refreshToken: next },
    });
    return result.count === 1;
  }
}
