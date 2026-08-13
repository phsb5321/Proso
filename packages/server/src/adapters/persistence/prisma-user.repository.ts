import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/modules/prisma.module';
import { type UserRecord, UserRepositoryPort } from '../../ports/user-repository.port';

@Injectable()
export class PrismaUserRepository extends UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toRecord(user) : null;
  }

  async findByLicenseKeyHash(keyHash: string): Promise<UserRecord | null> {
    const licenseKey = await this.prisma.licenseKey.findFirst({
      where: { keyHash, isActive: true },
      include: { user: true },
    });
    if (!licenseKey?.user) return null;
    return this.toRecord(licenseKey.user);
  }

  async create(user: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    const created = await this.prisma.user.create({
      data: {
        email: user.email,
        licenseKey: user.licenseKeyHash,
        paddleCustomerId: user.paddleCustomerId,
      },
    });
    return this.toRecord(created);
  }

  async update(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    return this.toRecord(updated);
  }

  private toRecord(
    user: {
      id: string;
      email: string | null;
      licenseKey: string | null;
      paddleCustomerId: string | null;
      createdAt: Date;
      updatedAt: Date;
    } & Record<string, unknown>,
  ): UserRecord {
    return {
      id: user.id,
      email: user.email ?? undefined,
      licenseKeyHash: user.licenseKey ?? undefined,
      paddleCustomerId: user.paddleCustomerId ?? undefined,
      tier: 'free', // Tier is determined by subscription, not User model
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
