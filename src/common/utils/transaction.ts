import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Retry complete DB-only operations, never external side effects. */
export async function serializable<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (error) {
      const failure = error as { code?: string; meta?: { target?: string[] } };
      const retryable =
        failure.code === 'P2034' ||
        (failure.code === 'P2002' &&
          failure.meta?.target?.includes('idempotencyKey'));
      if (!retryable || attempt >= 8) throw error;
      // Jitter prevents concurrent callers from colliding again in lockstep.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(500, 15 * 2 ** attempt) * (0.5 + Math.random()),
        ),
      );
    }
  }
}
