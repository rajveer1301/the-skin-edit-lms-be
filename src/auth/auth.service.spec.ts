import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { verifyGoogleToken } from './google-token';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('./google-token', () => ({ verifyGoogleToken: jest.fn() }));

describe('Authentication integrity', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  });
  async function setup() {
    const user = {
      id: 'synthetic-user-long-enough-for-a-shared-jwt-prefix',
      email: 'staff@example.test',
      role: Role.DOCTOR,
      active: true,
      firstName: 'Test',
      lastName: 'Staff',
      createdAt: new Date(),
      passwordHash: await bcrypt.hash('synthetic-password', 4),
      refreshToken: null,
    } as User;
    const db = {
      user: {
        findUnique: jest.fn(async () => ({ ...user })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.refreshToken && where.refreshToken !== user.refreshToken)
            return { count: 0 };
          Object.assign(user, data);
          return { count: 1 };
        }),
      },
    };
    return {
      user,
      db,
      auth: new AuthService(
        db as unknown as PrismaService,
        new JwtService(),
        config,
      ),
    };
  }
  it('rotates the entire token and rejects reuse of the previous token', async () => {
    const { auth } = await setup();
    const first = await auth.login('staff@example.test', 'synthetic-password');
    const second = await auth.refresh(first.refreshToken);
    expect(first.refreshToken).not.toBe(second.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      'Invalid refresh token',
    );
    await expect(auth.refresh(second.refreshToken)).resolves.toHaveProperty(
      'accessToken',
    );
  });
  it('allows only one concurrent refresh of a session', async () => {
    const { auth } = await setup();
    const first = await auth.login('staff@example.test', 'synthetic-password');
    const results = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.refresh(first.refreshToken),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('requires sign-in again for legacy truncated bcrypt token hashes', async () => {
    const { auth, user } = await setup();
    const first = await auth.login('staff@example.test', 'synthetic-password');
    user.refreshToken = await bcrypt.hash(first.refreshToken, 4);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      'Invalid refresh token',
    );
  });
  it('does not provision unknown Google users', async () => {
    const { auth, db } = await setup();
    jest.mocked(verifyGoogleToken).mockResolvedValue({
      email: 'unknown@example.test',
      firstName: 'Unknown',
      lastName: 'User',
    });
    db.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(auth.googleLogin('synthetic')).rejects.toThrow(
      'active staff account',
    );
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
