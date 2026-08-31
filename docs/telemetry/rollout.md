# Proso Telemetry Rollout Plan

> **Retired on 31/08/2026.** This plan was never completed. Public AMO builds initialize no telemetry, request no telemetry host permission, expose no telemetry toggle, and declare no data collection. The phases below are retained only as historical design context and are not an active roadmap.

This document outlines the original gradual rollout strategy for Proso's usage telemetry system.

## Overview

The telemetry system is rolled out in phases to ensure stability and gather feedback before full deployment.

## Rollout Phases

### Phase 1: Internal Testing (Week 1)

**Target**: Development team only

**Configuration**:
- `telemetryEnabled`: `true`
- `environment`: `dev`
- Gateway deployed to staging infrastructure

**Validation Checklist**:
- [ ] Events arrive in Loki within 60 seconds
- [ ] All expected lifecycle events tracked (background.started, popup.opened, etc.)
- [ ] Error events captured with full stack traces
- [ ] No sensitive data leaks (API keys, raw URLs)
- [ ] Circuit breaker functions correctly
- [ ] Extension performance not degraded (< 1ms overhead per handler)

**Success Criteria**:
- Zero crashes or errors caused by telemetry
- Event delivery rate > 99%
- No false positives in error capture

### Phase 2: Beta Testers (Week 2-3)

**Target**: Opt-in beta testers (~50 users)

**Configuration**:
- `telemetryEnabled`: `true` (opt-in via settings)
- `environment`: `staging`
- Gateway scaled for increased load

**Changes from Phase 1**:
- Add "Beta Telemetry" toggle in Developer settings
- Implement feedback mechanism for false positives

**Validation Checklist**:
- [ ] Telemetry toggle works correctly
- [ ] Disabling telemetry stops all event collection
- [ ] Gateway handles concurrent connections
- [ ] Rate limiting works as expected
- [ ] Buffer handles offline periods correctly

**Success Criteria**:
- User opt-out functions correctly
- No user-reported issues related to telemetry
- Gateway uptime > 99.9%
- Loki ingestion rate stable

### Phase 3: Soft Launch (Week 4-5)

**Target**: 10% of new installs

**Configuration**:
- `telemetryEnabled`: `true` (default for 10%)
- `environment`: `prod`
- Production gateway deployment

**Changes from Phase 2**:
- A/B testing flag for gradual rollout
- Monitoring dashboards created in Grafana
- Alerting for anomalies

**Validation Checklist**:
- [ ] A/B cohort correctly assigned
- [ ] Grafana dashboards show expected data
- [ ] Alerts fire for gateway errors
- [ ] Rollback mechanism tested
- [ ] Privacy policy updated

**Success Criteria**:
- No increase in uninstall rate for telemetry cohort
- Error visibility improved (can identify issues before user reports)
- Gateway handles production load

### Phase 4: Full Rollout (Week 6+)

**Target**: All users (opt-out available)

**Configuration**:
- `telemetryEnabled`: `true` (default, opt-out in settings)
- `environment`: `prod`

**Changes from Phase 3**:
- Remove A/B testing logic
- Default enabled for all users
- Prominent opt-out in settings

**Ongoing Monitoring**:
- Daily error rate tracking
- Weekly usage pattern analysis
- Monthly privacy audit

## Rollback Procedure

If issues are detected at any phase:

### Immediate Rollback (Client-side)

1. Push extension update with `telemetryEnabled: false` as default
2. Users receive update within 24-48 hours (Firefox auto-update)

### Emergency Rollback (Server-side)

1. Gateway can be taken offline immediately
2. Extension continues functioning (events buffered)
3. Circuit breaker opens after failures
4. No user-facing impact

### Partial Rollback

1. Reduce rollout percentage via A/B flag
2. Disable specific event types if problematic
3. Increase flush interval to reduce load

## Monitoring

### Key Metrics

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Gateway error rate | > 1% | Investigate, scale if needed |
| Event delivery latency | > 5s p95 | Check Loki/gateway load |
| Client buffer overflow | > 0.1% | Increase buffer or flush frequency |
| Circuit breaker opens | Any | Investigate gateway health |
| Uninstall rate | > baseline + 5% | Review telemetry impact |

### Grafana Dashboards

1. **Overview Dashboard**
   - Total events per hour
   - Error rate
   - Unique installs/sessions
   - Gateway health

2. **Error Dashboard**
   - Errors by type
   - Errors by entrypoint
   - Error trends
   - Top error messages

3. **Usage Dashboard**
   - Feature usage (playback, PDF, settings)
   - Session duration
   - Provider distribution
   - User funnel (opened → played)

## Privacy Compliance

### Before Each Phase

- [ ] Review data collection scope
- [ ] Verify redaction working correctly
- [ ] Confirm opt-out mechanism works
- [ ] Update privacy policy if needed

### Ongoing

- [ ] Monthly review of collected data types
- [ ] Quarterly data retention cleanup
- [ ] Annual privacy audit

## Communication

### Internal

- Slack channel for telemetry alerts
- Weekly summary of insights
- Incident postmortems

### External (Users)

- Changelog entry when telemetry launches
- Privacy policy update
- Settings page explanation
- FAQ on data collection

## Timeline

| Week | Phase | Action |
|------|-------|--------|
| 1 | Internal Testing | Deploy to dev, team testing |
| 2-3 | Beta Testers | Opt-in beta, gather feedback |
| 4-5 | Soft Launch | 10% rollout, production monitoring |
| 6+ | Full Rollout | All users, ongoing optimization |

## Contacts

- **Telemetry Owner**: [Team Lead]
- **Gateway Operations**: [DevOps]
- **Privacy Review**: [Legal/Compliance]
- **Escalation**: [Manager]
