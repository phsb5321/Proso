# Plan — Feature 193

## Constitution check

- **Privacy:** PASS. The entered loopback destination is reader-supplied, the route remains off by
  default for other profiles, and the daily profile grants it at runtime.
- **Security:** PASS WITH LOCAL-ONLY CONDITION. The HTTP exception is loopback; the service binds
  `127.0.0.1`. No secret is introduced.
- **Architecture:** PASS. Existing extension ports/adapters remain unchanged. The desktop wrapper
  conforms to their published host contract instead of adding a second client path.
- **Testing:** PASS when the exact real-host Nightly gate passes and the daily public actor produces
  a service request, then stops it.

## Approach

1. Preserve the selected Supertonic model and add a local compatibility surface around it outside
   the shipped extension. Publish English and Portuguese voice ids that map to the same ten model
   styles.
2. Run the existing real-host Firefox journey against the desktop endpoint. Treat its initial red
   result as the smallest failing check.
3. Fix the oracle's device-specific assumption: read `/v1/capabilities` during real-host preflight
   and compare background voices to that list. Keep fixture mode unchanged and fail closed on an
   empty list.
4. Configure the already-installed 1.2.9 extension in Firefox Nightly through AT-SPI public roles
   and actions: host entry, enable checkbox, Test connection, browser action, Play, and Stop.
5. Record the service request log, profile settings, exact extension version, gate receipt, and
   reversal in the canonical reading status.

## Measured red state

`LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301` reached ready health, loaded 10 then 20 voices,
and granted the host permission, but failed with:

> The settings UI reported the host was configured, but the background never adopted it as the
> audio route

The background query was hard-coded to English and compared only against the fixture's Orange Pi
ids. This was an oracle defect, not a product route failure.

## Verification

- `node --check scripts/local-host-journey-gate.mjs`
- `git diff --check`
- `node scripts/quality/check-active-docs.mjs`
- exact-head Firefox Nightly real-host journey against `http://127.0.0.1:5301`
- daily-profile AT-SPI public actor plus service journal
- different-family review of the final tracked diff

`make doctor` is expected to remain blocked in a fresh worktree whose generated Prisma client is
absent. Bootstrap is not run while the tracked postinstall global-hook-clobber problem remains open.

## Complexity tracking

The model wrapper and transient systemd unit live under `~/tts-bench-20260822-desktop/`, not in the
repository. This is intentional for the requested Nightly-local integration, but it does not survive
reboot. The upgrade path is a separate declarative Nix user-service slice after the route and human
listening gates pass.

The RX 5700 XT WebGPU benchmark is retained separately. It measured 17.86× real-time but the GPU
service launch failed before HTTP readiness because its isolated environment lacked server
dependencies. The verified Nightly route therefore keeps the CPU bridge.

## Reversal

Through the same public settings controls, restore
`https://orangepi4pro-b.tailf59220.ts.net`, Automatic voice, enabled local provider, and its runtime
grant. To remove desktop synthesis entirely, stop `supertonic3-tts-desktop.service`; no extension
binary or production source needs reverting.
