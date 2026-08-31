#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(git rev-parse --show-toplevel)"
readonly ROOT
readonly TRUST_CHAIN_SCRIPTS=(
  "$ROOT/scripts/adversarial-review.sh"
  "$ROOT/scripts/adversarial-review.self-test.sh"
  "$ROOT/scripts/validate-gate-receipt.sh"
  "$ROOT/scripts/write-gate-receipt.sh"
)
if grep -nE '^[[:space:]]*readonly[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=.*\$\(' \
  "${TRUST_CHAIN_SCRIPTS[@]}"; then
  printf 'Self-test failed: receipt trust chain masks a command status with readonly\n' >&2
  exit 1
fi

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/proso-adversarial-self-test.XXXXXXXX")"
readonly TEMP_ROOT
readonly REPO="$TEMP_ROOT/repo"
readonly FAKE_BIN="$TEMP_ROOT/bin"
readonly MODEL_MARKER="$TEMP_ROOT/model-called"
readonly OUTPUT="$TEMP_ROOT/output.log"

cleanup() {
  rm -rf -- "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$REPO/scripts" "$REPO/docs" "$FAKE_BIN"
cp -- "$ROOT/scripts/adversarial-review.sh" "$REPO/scripts/"
cp -- "$ROOT/scripts/change-bundle.sh" "$REPO/scripts/"
cp -- "$ROOT/scripts/validate-gate-receipt.sh" "$REPO/scripts/"
cp -- "$ROOT/Makefile" "$REPO/"
cp -- "$ROOT/docs/agent-delivery-harness.md" "$REPO/docs/"
chmod +x "$REPO/scripts/"*.sh

cat >"$FAKE_BIN/claude" <<'SH'
#!/usr/bin/env bash
set -eu
: "${ADVERSARIAL_SELF_TEST_MODEL_MARKER:?}"
touch "$ADVERSARIAL_SELF_TEST_MODEL_MARKER"
exit 99
SH
chmod +x "$FAKE_BIN/claude"

git -C "$REPO" init -q -b main
git -C "$REPO" add Makefile docs scripts
baseline_tree="$(git -C "$REPO" write-tree)"
baseline_commit="$(printf 'baseline\n' | git -C "$REPO" -c commit.gpgSign=false commit-tree "$baseline_tree")"
git -C "$REPO" update-ref refs/heads/main "$baseline_commit"
git -C "$REPO" update-ref refs/remotes/origin/main "$baseline_commit"
printf '\n# non-empty candidate\n' >>"$REPO/Makefile"

status=0
(
  cd "$REPO"
  PATH="$FAKE_BIN:$PATH" \
    ADVERSARIAL_SELF_TEST_MODEL_MARKER="$MODEL_MARKER" \
    GATE_RECEIPT_PATH="$TEMP_ROOT/missing-receipt.json" \
    GENERATOR_FAMILY=openai \
    DETERMINISTIC_GATE=self-test \
    ./scripts/adversarial-review.sh
) >"$OUTPUT" 2>&1 || status=$?

if [[ "$status" -eq 0 ]]; then
  cat "$OUTPUT" >&2
  printf 'Self-test failed: missing receipt returned success\n' >&2
  exit 1
fi
if [[ -e "$MODEL_MARKER" ]]; then
  cat "$OUTPUT" >&2
  printf 'Self-test failed: missing receipt reached the reviewer executable\n' >&2
  exit 1
fi
if ! grep -F 'Deterministic gate receipt is missing:' "$OUTPUT" >/dev/null; then
  cat "$OUTPUT" >&2
  printf 'Self-test failed for a reason other than the missing receipt\n' >&2
  exit 1
fi

printf 'adversarial review self-test: missing receipt failed before reviewer launch\n'
