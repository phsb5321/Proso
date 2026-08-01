# Contracts: Proso Infrastructure Rebrand

No new API contracts are introduced by this feature. This is an infrastructure-only migration that:

- Creates no new API endpoints
- Modifies no existing API schemas
- Changes no request/response formats

The existing 9 API endpoints continue to serve identical responses on the new domain (`api.proso.com`):

1. `GET /health` - Health check
2. `POST /license/validate` - License validation
3. `GET /subscription/:id` - Subscription details
4. `GET /voices` - Available voices
5. `GET /credits/balance` - Credit balance
6. `GET /credits/history` - Credit history
7. `POST /synthesize` - TTS synthesis
8. `POST /checkout` - Paddle checkout
9. `POST /webhook` - Paddle webhook handler

Verification: All 9 endpoints must return identical responses when accessed via both `api.proso.com` and `voxpage-api.home301server.com.br` during the transition period.
