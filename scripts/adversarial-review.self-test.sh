#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(git rev-parse --show-toplevel)"
readonly ROOT
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/proso-adversarial-self-test.XXXXXXXX")"
readonly TEMP_ROOT
readonly REPO="$TEMP_ROOT/repo"
readonly FAKE_BIN="$TEMP_ROOT/bin"
readonly MODEL_MARKER="$TEMP_ROOT/model-called"
readonly OUTPUT="$TEMP_ROOT/output.log"
readonly MALFORMED_OUTPUT="$TEMP_ROOT/malformed-output.log"
readonly META_OUTPUT="$TEMP_ROOT/meta-output.log"
readonly PROMPT_CAPTURE="$TEMP_ROOT/reviewer-prompt.txt"
readonly FAKE_KEY="$TEMP_ROOT/groq-key"
readonly TRACKED_MANIFEST="$TEMP_ROOT/tracked.z"
readonly UNCHANGED_CONTEXT_MARKER='PROSO_UNCHANGED_CONTEXT_MUST_NOT_BE_INLINED'

cleanup() {
  rm -rf -- "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

git -C "$ROOT" ls-files -z >"$TRACKED_MANIFEST"
shell_scripts=()
while IFS= read -r -d '' tracked_path; do
  # .specify scripts are vendored spec-kit tooling, not Proso delivery gates.
  if [[ "$tracked_path" == .specify/* ]]; then
    continue
  fi
  full_path="$ROOT/$tracked_path"
  if [[ ! -r "$full_path" ]]; then
    printf 'Self-test failed: tracked file is unreadable: %s\n' "$tracked_path" >&2
    exit 1
  fi
  first_line=''
  if ! IFS= read -r first_line <"$full_path"; then
    [[ -n "$first_line" ]] || continue
  fi
  if [[ "$first_line" =~ ^#!.*(bash|sh|zsh|ksh|dash)([[:space:]]|$) ]]; then
    shell_scripts+=("$full_path")
  fi
done <"$TRACKED_MANIFEST"
if [[ "${#shell_scripts[@]}" -eq 0 ]]; then
  printf 'Self-test failed: no tracked shell scripts were discovered\n' >&2
  exit 1
fi
readonly -a shell_scripts

mask_scan_status=0
grep -nE \
  '^[[:space:]]*(readonly|local|declare|export)([[:space:]]+-[^[:space:]]*)?[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=.*\$\(' \
  "${shell_scripts[@]}" || mask_scan_status=$?
case "$mask_scan_status" in
  0)
    printf 'Self-test failed: delivery script masks a command status in a declaration\n' >&2
    exit 1
    ;;
  1) ;;
  *)
    printf 'Self-test failed: could not scan delivery scripts (grep exit %s)\n' \
      "$mask_scan_status" >&2
    exit 1
    ;;
esac

mkdir -p "$REPO/scripts" "$REPO/docs" "$FAKE_BIN"
cp -- "$ROOT/scripts/adversarial-review.sh" "$REPO/scripts/"
cp -- "$ROOT/scripts/change-bundle.sh" "$REPO/scripts/"
cp -- "$ROOT/scripts/validate-gate-receipt.sh" "$REPO/scripts/"
cp -- "$ROOT/scripts/write-gate-receipt.sh" "$REPO/scripts/"
cp -- "$ROOT/Makefile" "$REPO/"
cp -- "$ROOT/docs/agent-delivery-harness.md" "$REPO/docs/"
printf '\n%s\n' "$UNCHANGED_CONTEXT_MARKER" >>"$REPO/docs/agent-delivery-harness.md"
chmod +x "$REPO/scripts/"*.sh

cat >"$FAKE_BIN/claude" <<'SH'
#!/usr/bin/env bash
set -eu
: "${ADVERSARIAL_SELF_TEST_MODEL_MARKER:?}"
touch "$ADVERSARIAL_SELF_TEST_MODEL_MARKER"
if [[ "${ADVERSARIAL_SELF_TEST_RESPONSE:-}" == 'generic' ]]; then
  : "${ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE:?}"
  cat >"$ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE"
  cat <<'JSON'
{"structured_output":{"verdict":"PASS","summary":"This placeholder summary is deliberately long enough for the JSON schema but supplies no review conclusion or concrete evidence.","requirementTraces":[{"id":"REQ-1","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."},{"id":"REQ-2","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."},{"id":"REQ-3","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."},{"id":"REQ-4","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."},{"id":"REQ-5","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."},{"id":"REQ-6","requirement":"This placeholder requirement is deliberately long but does not match the canonical trace.","status":"PASS","evidence":"This placeholder evidence is deliberately long and contains no concrete repository path or executable assertion."}],"findings":[]}}
JSON
  exit 0
fi
exit 99
SH
chmod +x "$FAKE_BIN/claude"

cat >"$FAKE_BIN/curl" <<'SH'
#!/usr/bin/env bash
set -eu
: "${ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE:?}"
request=''
for argument in "$@"; do
  if [[ "$argument" == @* ]]; then
    request="${argument#@}"
  fi
done
[[ -r "$request" ]]
jq -r '.messages[0].content' "$request" >"$ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE"
printf '%s\n' '{"model":"llama-3.3-70b-versatile","choices":[{"message":{"content":"{}"}}]}'
SH
chmod +x "$FAKE_BIN/curl"
printf 'self-test-key\n' >"$FAKE_KEY"

git -C "$REPO" init -q -b main
git -C "$REPO" add Makefile docs scripts
baseline_tree="$(git -C "$REPO" write-tree)"
baseline_commit="$(printf 'baseline\n' | git -C "$REPO" -c commit.gpgSign=false commit-tree "$baseline_tree")"
git -C "$REPO" update-ref refs/heads/main "$baseline_commit"
git -C "$REPO" update-ref refs/remotes/origin/main "$baseline_commit"
printf '\n# PROSO_CANDIDATE_DIFF_MUST_STAY_INLINE\n' >>"$REPO/Makefile"

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

(
  cd "$REPO"
  GATE_RECEIPT_PATH="$TEMP_ROOT/valid-receipt.json" \
    DIFF_BASE_REF=origin/main \
    ./scripts/write-gate-receipt.sh
) >/dev/null
rm -f "$MODEL_MARKER"
status=0
(
  cd "$REPO"
  PATH="$FAKE_BIN:$PATH" \
    ADVERSARIAL_SELF_TEST_MODEL_MARKER="$MODEL_MARKER" \
    ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE="$PROMPT_CAPTURE" \
    ADVERSARIAL_SELF_TEST_RESPONSE=generic \
    GATE_RECEIPT_PATH="$TEMP_ROOT/valid-receipt.json" \
    GENERATOR_FAMILY=openai \
    DETERMINISTIC_GATE=self-test \
    ./scripts/adversarial-review.sh
) >"$MALFORMED_OUTPUT" 2>&1 || status=$?

if [[ "$status" -eq 0 || ! -e "$MODEL_MARKER" ]]; then
  cat "$MALFORMED_OUTPUT" >&2
  printf 'Self-test failed: generic reviewer evidence was not rejected after launch\n' >&2
  exit 1
fi
if ! grep -F 'Adversarial reviewer returned a malformed verdict:' "$MALFORMED_OUTPUT" >/dev/null; then
  cat "$MALFORMED_OUTPUT" >&2
  printf 'Self-test rejected generic reviewer evidence for the wrong reason\n' >&2
  exit 1
fi
if grep -F 'command not found' "$MALFORMED_OUTPUT" >/dev/null; then
  cat "$MALFORMED_OUTPUT" >&2
  printf 'Self-test failed: reviewer prompt executed shell content\n' >&2
  exit 1
fi
for expected in Makefile docs/agent-delivery-harness.md PROSO_CANDIDATE_DIFF_MUST_STAY_INLINE; do
  if ! grep -F "$expected" "$PROMPT_CAPTURE" >/dev/null; then
    printf 'Self-test failed: repo-aware prompt omitted required reference: %s\n' "$expected" >&2
    exit 1
  fi
done
if grep -F "$UNCHANGED_CONTEXT_MARKER" "$PROMPT_CAPTURE" >/dev/null; then
  printf 'Self-test failed: repo-aware prompt inlined unchanged file content\n' >&2
  exit 1
fi

rm -f "$PROMPT_CAPTURE"
status=0
(
  cd "$REPO"
  PATH="$FAKE_BIN:$PATH" \
    ADVERSARIAL_REVIEWER=meta-llama \
    ADVERSARIAL_SELF_TEST_PROMPT_CAPTURE="$PROMPT_CAPTURE" \
    GATE_RECEIPT_PATH="$TEMP_ROOT/valid-receipt.json" \
    GENERATOR_FAMILY=openai \
    GROQ_API_KEY_FILE="$FAKE_KEY" \
    DETERMINISTIC_GATE=self-test \
    ./scripts/adversarial-review.sh
) >"$META_OUTPUT" 2>&1 || status=$?
if [[ "$status" -eq 0 || ! -s "$PROMPT_CAPTURE" ]]; then
  cat "$META_OUTPUT" >&2
  printf 'Self-test failed: Meta prompt was not captured and rejected\n' >&2
  exit 1
fi
for expected in PROSO_CANDIDATE_DIFF_MUST_STAY_INLINE "$UNCHANGED_CONTEXT_MARKER"; do
  if ! grep -F "$expected" "$PROMPT_CAPTURE" >/dev/null; then
    printf 'Self-test failed: Meta prompt omitted inline context: %s\n' "$expected" >&2
    exit 1
  fi
done

printf 'adversarial review self-test: receipt, prompt, and verdict boundaries fail closed\n'
