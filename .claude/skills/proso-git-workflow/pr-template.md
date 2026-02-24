# Pull Request Template

Use this template when creating PRs for Proso.

## PR Body Format

```markdown
## Summary

- [First major change or feature]
- [Second change]
- [Additional changes...]

## Test Plan

- [ ] Manual testing: [describe steps]
- [ ] Unit tests pass: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Quality checks: `npm run quality`

## Related Issues

[Choose one of the following formats:]
- Closes #NNN (if this PR fully resolves the issue)
- Relates to #NNN (if this PR is related but doesn't close)
- Part of #NNN (if this is incremental work toward an issue)

## Screenshots (if applicable)

[Add screenshots for UI changes]

---
Generated with [Claude Code](https://claude.com/claude-code)
```

## PR Title Format

Format: `type: description`

Examples:
- `feat: Add git workflow automation hooks and skills`
- `fix: Correct paragraph highlighting sync drift`
- `docs: Update architecture documentation`
- `refactor: Extract message handlers into registry pattern`

## Checklist Before Creating PR

1. All commits pushed to remote
2. Branch is up-to-date with main (rebase if needed)
3. Tests pass locally
4. Lint passes locally
5. No unintended file changes
6. PR title follows conventional format
7. PR body includes summary, test plan, and issue links
