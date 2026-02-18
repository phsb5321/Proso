import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // Short burst: 3 requests per second
      { name: 'short', ttl: 1000, limit: 3 },
      // Medium: 20 requests per 10 seconds
      { name: 'medium', ttl: 10000, limit: 20 },
      // Long: 100 requests per minute
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
  ],
})
export class RateLimitModule {}
