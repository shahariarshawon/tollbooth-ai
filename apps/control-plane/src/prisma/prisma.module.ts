import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@tollbooth/database';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
