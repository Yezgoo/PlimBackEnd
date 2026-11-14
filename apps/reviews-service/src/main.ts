import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
class ReviewsModule {}

const app = await NestFactory.create(ReviewsModule);
app.enableShutdownHooks();
await app.listen(process.env.REVIEWS_SERVICE_PORT ?? 3006);
