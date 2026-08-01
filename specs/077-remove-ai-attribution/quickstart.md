# Quickstart: Remove AI Attribution

**One-time execution runbook. Follow phases in order.**

## Prerequisites

- [x] `gh` CLI authenticated (`gh auth status`)
- [x] `git-filter-repo` available (`nix-shell -p git-filter-repo`)
- [x] SSH access to GitHub (`ssh -T git@github.com`)
- [x] Current work committed and pushed

## Phase 1: Config Enforcement (DONE)

Already completed. `.gitignore` updated, AI files removed from tracking, CLAUDE.md and git workflow skill enforce no-attribution rules.

## Phase 2: Clean PR Descriptions

```bash
# 1. Preview
./scripts/remove-ai-attribution.sh --dry-run

# 2. Execute
./scripts/remove-ai-attribution.sh

# 3. Verify
gh pr list --state all --limit 100 --json number,body | \
  jq '[.[] | select(.body | test("Claude|Generated with|Anthropic"; "i"))] | length'
```

## Phase 3: Rewrite Git History

```bash
# 1. Backup
git bundle create /tmp/proso-backup-$(date +%Y%m%d).bundle --all

# 2. Fresh clone
git clone git@github.com:phsb5321/Proso.git /tmp/proso-rewrite
cd /tmp/proso-rewrite

# 3. Rewrite
nix-shell -p git-filter-repo --run "git filter-repo --message-callback '
import re
message = re.sub(br\"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*Generated with \[Claude Code\].*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?\", b\"\", message)
message = re.sub(br\"\n{3,}\", b\"\n\n\", message)
message = message.rstrip() + b\"\n\"
return message
'"

# 4. Push
git remote add origin git@github.com:phsb5321/Proso.git
gh api -X DELETE repos/phsb5321/Proso/branches/main/protection 2>/dev/null
git push origin --force --all
git push origin --force --tags

# 5. Verify
git log --all --format="%b" | grep -ic "co-authored-by.*claude\|co-authored-by.*anthropic"
```

## Phase 4: Re-clone & Restore

```bash
# 1. Re-clone
cd /home/notroot/Documents/Code/Firefox
mv Proso Proso-old  # keep old copy until verified
git clone git@github.com:phsb5321/Proso.git
cd Proso

# 2. Restore local-only files
cp -r ../Proso-old/.claude .
cp ../Proso-old/CLAUDE.md .
cp ../Proso-old/.mcp.json .
cp -r ../Proso-old/.opencode . 2>/dev/null
cp -r ../Proso-old/.specify . 2>/dev/null
cp -r ../Proso-old/specs . 2>/dev/null

# 3. Install deps & verify
pnpm install
pnpm --filter @proso/extension dev

# 4. Clean up old copy (after verification)
rm -rf ../Proso-old
```
