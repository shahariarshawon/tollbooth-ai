import { Injectable, Logger } from '@nestjs/common';
import type { Alert } from '@tollbooth/database';

/**
 * Phase 11, Task 4: a notification channel sends an alert somewhere. There is exactly one real
 * implementation of each today — a log line — standing in for the real integration (Task 4: "Do not
 * implement external APIs now"). Adding Slack or email for real means implementing `send()` here;
 * nothing that calls `NotificationService.sendNotification()` would need to change.
 */
export interface NotificationChannel {
  readonly name: string;
  send(alert: Alert): Promise<void>;
}

class EmailNotificationChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger('EmailNotificationChannel');

  async send(alert: Alert): Promise<void> {
    // Placeholder: would email the tenant's admins. No SMTP/provider wired up yet.
    this.logger.log(
      `[placeholder] would email tenant ${alert.tenantId} about ${alert.type}: ${alert.message}`,
    );
  }
}

class SlackNotificationChannel implements NotificationChannel {
  readonly name = 'slack';
  private readonly logger = new Logger('SlackNotificationChannel');

  async send(alert: Alert): Promise<void> {
    // Placeholder: would post to the tenant's configured webhook. No webhook URL exists yet.
    this.logger.log(
      `[placeholder] would post to Slack for tenant ${alert.tenantId}: ${alert.message}`,
    );
  }
}

/** sendNotification(alert) fans out to every channel; one channel failing never affects another. */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly channels: NotificationChannel[] = [
    new EmailNotificationChannel(),
    new SlackNotificationChannel(),
  ];

  async sendNotification(alert: Alert): Promise<void> {
    await Promise.all(
      this.channels.map((channel) =>
        channel.send(alert).catch((error: unknown) => {
          this.logger.warn(
            `Notification channel "${channel.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }),
      ),
    );
  }
}
