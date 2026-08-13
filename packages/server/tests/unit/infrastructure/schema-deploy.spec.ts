// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/** Pins the schema application command used by both Dokku release surfaces. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serverRoot = resolve(__dirname, '..', '..', '..');

describe('server schema deployment', () => {
  it('runs the checked-in db-push predeploy script from both release surfaces', () => {
    const procfile = readFileSync(resolve(serverRoot, 'Procfile'), 'utf8');
    const appJson = JSON.parse(readFileSync(resolve(serverRoot, 'app.json'), 'utf8')) as {
      scripts: { dokku: { predeploy: string } };
    };
    const predeploy = readFileSync(resolve(serverRoot, 'scripts/predeploy.sh'), 'utf8');

    expect(procfile).toContain('release: sh scripts/predeploy.sh');
    expect(appJson.scripts.dokku.predeploy).toBe('sh scripts/predeploy.sh');
    expect(predeploy.match(/prisma db execute/g)).toHaveLength(2);
    expect(predeploy).toContain('/app/scripts/prepare-license-issuance-schema.sql');
    expect(predeploy).toContain('prisma db push');
    expect(predeploy).toContain('/app/prisma/schema.prisma');

    const bridge = readFileSync(
      resolve(serverRoot, 'scripts/prepare-license-issuance-schema.sql'),
      'utf8',
    );
    expect(bridge).toContain('ALTER COLUMN "licenseKey" DROP NOT NULL');
    expect(bridge).toContain('"User_paddleCustomerId_key"');
    expect(bridge).toContain('"CreditAllocation_paddleTransactionId_key"');
    expect(bridge).toContain('"PaddleWebhookEvent_pkey"');
    expect(bridge).toContain('"Subscription_paddle_claim_pair_check"');
  });
});
