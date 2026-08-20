# Done-oracles

Executable predicates. Each one exits 0 **only** when the thing it names is
actually true for a reader, and non-zero otherwise — including when it cannot
tell. `UNKNOWN` is never a pass.

| Oracle | Answers |
|---|---|
| `account-free-reading-path` | Can a reader with no account, no license key and no BYOK credential obtain audio? (specs/095 INV-001) |
| `deploy-smoke` | Is the deployed server answering every reader-facing read? |

## Rules these follow

- **Probe what breaks the user, not what is easy to check.** The first draft of
  `account-free-reading-path` grepped for `speechSynthesis`, found a
  `case 'speakText'` handler, and called browser TTS shipped. Nothing sends
  that message — the handler is dead code, and the grep would have reported
  green while no reader could hear anything. It now requires a caller.
- **Test the real target.** The authoritative signal is the response of
  `api.proso.com.br`, not `FEATURE_MATRIX` in source: flipping the flag and
  never deploying must not turn an oracle green.
- **Fail closed.** Unreachable host, non-JSON, missing `curl`/`jq`, timeout, or
  an unrecognised status is a failure.
- **Read-only.** These observe. They never write config, deploy, or mutate
  another user's state.
- **No check may clear another check's failure.** The two routes to audio are
  scored independently and combined once, at the end.

## Running

```bash
./scripts/oracles/account-free-reading-path   # exit 1 today: both routes blocked
./scripts/oracles/deploy-smoke                # exit 0 today

# against a stub instead of production
PROSO_SERVER_URL=http://127.0.0.1:8791 ./scripts/oracles/account-free-reading-path
```

Proso is on the fleet framework: the problem has a ledger row
(`fleet-intel show proso-account-free-reading`), this oracle is that row's
done-oracle, and `release-gate` refuses a release while the row is red.
