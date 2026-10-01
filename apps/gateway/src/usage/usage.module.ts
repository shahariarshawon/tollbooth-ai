import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { UsageRepository } from './usage.repository';
import { UsageService } from './usage.service';

@Module({
  imports: [RequestsModule],
  providers: [UsageRepository, UsageService],
  exports: [UsageService],
})
export class UsageModule {}
