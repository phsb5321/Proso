// User repository port — abstract contract for user persistence
// Used by license validation service; implemented by Prisma adapter

export abstract class UserRepositoryPort {
  abstract findById(id: string): Promise<UserRecord | null>;
  abstract findByLicenseKeyHash(keyHash: string): Promise<UserRecord | null>;
  abstract create(user: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord>;
  abstract update(id: string, data: Partial<UserRecord>): Promise<UserRecord>;
}

export interface UserRecord {
  id: string;
  email?: string;
  /** Deprecated legacy field; licence validation uses LicenseKey.keyHash. */
  licenseKeyHash?: string;
  paddleCustomerId?: string;
  deviceId?: string;
  tier: string;
  createdAt: Date;
  updatedAt: Date;
}
