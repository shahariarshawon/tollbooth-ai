import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Makes PrismaService injectable everywhere in an app. Import it once in the root module. */
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
