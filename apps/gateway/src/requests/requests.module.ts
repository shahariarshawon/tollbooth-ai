import { Module } from '@nestjs/common';
import { RequestRepository } from './request.repository';
import { RequestService } from './request.service';

@Module({ providers: [RequestRepository, RequestService], exports: [RequestService] })
export class RequestsModule {}
