import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [AlertService, NotificationService],
  exports: [AlertService],
})
export class AlertModule {}
