import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { isOk, unwrapErr } from '@proso/shared';
import { Public } from '../guards/license-key.guard';
import { PaddleWebhookGuard, type WebhookRequest } from '../guards/paddle-webhook.guard';
import { PaddleWebhookProcessor } from '../services/paddle-webhook.processor';

/** HTTP boundary for signed, atomic Paddle provisioning. */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly processor: PaddleWebhookProcessor) {}

  @Post('paddle')
  @Public()
  @UseGuards(PaddleWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async handlePaddleWebhook(@Req() req: WebhookRequest): Promise<{ received: true }> {
    const event = req.webhookEvent;
    const result = await this.processor.process(event);

    if (!isOk(result)) {
      const error = unwrapErr(result);
      this.logger.error(
        `Paddle webhook processing failed: type=${event.eventType} id=${event.eventId} code=${error.code}`,
      );
      throw new ServiceUnavailableException('Paddle webhook processing failed');
    }

    if (result.value.status === 'duplicate') {
      this.logger.debug(`Duplicate Paddle webhook ignored: ${event.eventId}`);
    } else {
      this.logger.log(`Paddle webhook committed: type=${event.eventType} id=${event.eventId}`);
    }
    return { received: true };
  }
}
