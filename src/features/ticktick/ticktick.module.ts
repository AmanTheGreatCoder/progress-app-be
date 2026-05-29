import { Module } from '@nestjs/common';
import { TickTickController } from './ticktick.controller';
import { TickTickService } from './ticktick.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TickTickController],
  providers: [TickTickService],
  exports: [TickTickService],
})
export class TickTickModule {}
