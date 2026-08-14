import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Allow larger request bodies so base64-encoded treatment images fit.
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigin = config.get<string>('CORS_ORIGIN')?.trim();
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // In production, restrict to the configured comma-separated origins.
  // Otherwise (dev) or when CORS_ORIGIN is "*", reflect the request origin so
  // any localhost port / client works while still allowing credentials.
  const shouldReflectOrigin =
    !isProduction || !corsOrigin || corsOrigin === '*';

  app.enableCors({
    origin: shouldReflectOrigin
      ? true
      : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  console.log(`The Skin Edit API is running on http://localhost:${port}/api`);
}

void bootstrap();
