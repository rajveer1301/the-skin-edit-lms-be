import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { mapUser, UserDto } from '../common/mappers/user.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { verifyGoogleToken, GoogleProfile } from './google-token';
import { JwtPayload } from './strategies/jwt.strategy';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user);
  }

  async googleLogin(credential: string): Promise<AuthResponse> {
    let profile: GoogleProfile;
    try {
      profile = await verifyGoogleToken(
        credential,
        this.config.get<string>('GOOGLE_CLIENT_ID'),
      );
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (!user || !user.active)
      throw new UnauthorizedException('An active staff account is required');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.active || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const digest = createHash('sha256').update(refreshToken).digest('hex');
    const matches =
      user.refreshToken.length === digest.length &&
      timingSafeEqual(Buffer.from(digest), Buffer.from(user.refreshToken));
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(user, user.refreshToken);
  }

  async logout(userId: string): Promise<{ success: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { success: true };
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return mapUser(user);
  }

  private async issueTokens(
    user: User,
    expectedRefresh?: string,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
        '15m') as JwtSignOptions['expiresIn'],
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as JwtSignOptions['expiresIn'],
      },
    );
    const hashed = createHash('sha256').update(refreshToken).digest('hex');
    const changed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        active: true,
        passwordHash: user.passwordHash,
        ...(expectedRefresh ? { refreshToken: expectedRefresh } : {}),
      },
      data: { refreshToken: hashed },
    });
    if (changed.count !== 1)
      throw new UnauthorizedException('Session has expired; sign in again');
    return { accessToken, refreshToken, user: mapUser(user) };
  }
}
