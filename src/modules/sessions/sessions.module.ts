import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [SessionsService],
  exports: [SessionsService],
  controllers: [SessionsController],
})
export class SessionsModule {}
