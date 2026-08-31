# Tasks — Feature 240

- [x] T001 Capture the before state: AMO dashboard versions/channel/name, anonymous 404/search result, live site install target, update feed, XPI hash, CloudFront origin, and DNS target.
- [x] T002 Build unlisted and listed Firefox 1.2.9 artifacts from the isolated worktree; run the release-channel gate and Mozilla validator.
- [x] T003 Normalize root and package licence metadata to AGPL-3.0-or-later, matching Proso’s existing public terms.
- [x] T003A Remove remote telemetry from the public build, declare required website-content transmission truthfully, and expose the first-run data disclosure.
- [x] T004 Update website canonical URLs and Firefox install/status copy to the stable public AMO product URL; retain truthful fail-closed wording until approval.
- [x] T005 Add the smallest runnable publication check covering listed-manifest invariants and anonymous AMO done-state.
- [x] T006 Run `make doctor`, targeted checks, fuzz, release-channel validation, and the loaded-Firefox diagnostic.
- [ ] T007 Submit the exact listed 1.2.9 artifact and source archive as a Mozilla-hosted version with reproducible build/permission notes.
- [ ] T008 Update the AMO product page to Proso with description, categories, website/support, privacy policy, licence, and store screenshots.
- [ ] T009 Resolve every automated or human Mozilla review finding without weakening checks; poll until anonymous public status passes.
- [ ] T010 Update `gh-pages` update links to `proso.com.br` while preserving every version and hash; verify both XPI bytes.
- [ ] T011 Assemble and deploy the reviewed site to the existing CloudFront origin; verify all pages, update metadata, XPI content types, and no orphaned release files.
- [ ] T012 Replace the timed-out ACM request, create the exact Cloudflare validation record, wait for `ISSUED`, and attach `proso.com.br` to the distribution.
- [ ] T013 Cut over only the `proso.com.br` DNS target and verify the public AMO install funnel plus update lifeline; retain the old target for rollback.
- [ ] T014 Commit the exact candidate, run `make verify` and `GENERATOR_FAMILY=openai make gate`, then obtain a different-family exact-head review.
- [ ] T015 Push through PR, satisfy CI/review, merge eligible repository changes, and record live receipts plus one-line rollback paths.
- [ ] T016 Run the fleet done-oracle; mark completion only when the public GUID reports a public current version and the live site/install/update probes pass.
