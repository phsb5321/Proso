import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { processPaddleWebhook } from '../../core/subscription/paddle-webhook.service';
import { PaddleProvisioningPort, type WebhookEvent } from '../../ports/paddle-provisioning.port';

/** Composition adapter between Nest configuration and the pure webhook domain. */
@Injectable()
export class PaddleWebhookProcessor {
  constructor(
    private readonly config: ConfigService,
    private readonly provisioning: PaddleProvisioningPort,
  ) {}

  process(event: WebhookEvent) {
    return processPaddleWebhook(
      event,
      {
        proMonthly: this.config.get<string>('app.paddlePriceProMonthly') ?? '',
        proYearly: this.config.get<string>('app.paddlePriceProYearly') ?? '',
        enterpriseMonthly: this.config.get<string>('app.paddlePriceEnterpriseMonthly') ?? '',
        enterpriseYearly: this.config.get<string>('app.paddlePriceEnterpriseYearly') ?? '',
        licenseKeySecret: this.config.get<string>('app.licenseKeySecret') ?? '',
        nodeEnv: this.config.get<string>('app.nodeEnv'),
      },
      this.provisioning,
    );
  }
}
