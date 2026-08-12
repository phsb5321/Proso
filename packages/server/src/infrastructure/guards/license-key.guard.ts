// License key guard — optional identity, never mandatory account creation.
//
// The guard answers one question for every request: which user, if any, is
// making it. It is registered globally by `AuthModule` (APP_GUARD), so the
// answer is attached before any controller reads `req.userId`.
//
// Three outcomes, in the order a request meets them:
//
//   @Public()          -> allowed, no header read, no repository lookup
//   no X-License-Key   -> allowed with no identity (INV-001: the free tier
//                         never requires account creation)
//   X-License-Key: k   -> SHA-256(k) resolved through UserRepositoryPort;
//                         a match attaches `req.userId`, a miss is 401
//
// A presented key that resolves to nobody is a visible 401 rather than a
// silent downgrade to Free: a reader who typed a key and got free-tier limits
// with no explanation cannot tell a typo from an expired subscription. For the
// same reason a repository failure propagates (500) instead of being caught —
// "the database is down" must not read as "you are not a customer".

import * as crypto from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRepositoryPort } from '../../ports/user-repository.port';

const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * What the guard attaches to the request. Controllers read `userId` through
 * their own intersection type today, so this is deliberately not exported —
 * an exported type nothing imports is what the unused-code ratchet exists to
 * reject.
 */
interface AuthenticatedRequest extends Request {
  licenseKey?: string;
  userId?: string;
}

@Injectable()
export class LicenseKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const licenseKey = readLicenseKeyHeader(request);

    // No key: the account-free route. The request proceeds with no identity,
    // and every downstream tier decision sees Free.
    if (licenseKey === undefined) return true;

    const keyHash = crypto.createHash('sha256').update(licenseKey).digest('hex');
    const user = await this.userRepository.findByLicenseKeyHash(keyHash);

    if (!user) {
      throw new UnauthorizedException('Invalid X-License-Key');
    }

    request.licenseKey = licenseKey;
    request.userId = user.id;
    return true;
  }
}

/**
 * The presented key, or `undefined` when none was presented.
 *
 * An empty or whitespace-only header value is treated as absent rather than as
 * an invalid key: a client that always sends the header and fills it only once
 * the reader has a subscription is presenting nothing, not presenting garbage.
 * A duplicated header arrives as an array; the first value is used, and it
 * still has to resolve to a user or the request is rejected.
 */
function readLicenseKeyHeader(request: Request): string | undefined {
  const raw = request.headers['x-license-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
