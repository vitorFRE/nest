import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Role } from '../../generated/prisma/enums';
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
        throw new BadRequestException('Não foi possível concluir o cadastro');
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

  async updateAdmin(id: string, data: { role?: Role; isActive?: boolean }) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');

    const wouldRemoveActiveAdmin =
      current.role === Role.ADMIN &&
      current.isActive &&
      ((data.role !== undefined && data.role !== Role.ADMIN) ||
        data.isActive === false);

    if (wouldRemoveActiveAdmin) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          id: { not: id },
          role: Role.ADMIN,
          isActive: true,
        },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException(
          'Não é possível remover o último administrador ativo',
        );
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: userProfileSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuário não encontrado');
      }
      throw error;
    }
  }
}
