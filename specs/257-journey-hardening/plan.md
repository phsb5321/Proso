# Plan

Causal hypothesis: empty audio arrays, elapsed time and discovered build output
allow false positives because they omit the conditions each verdict assumes.
Falsifier: absent observer/audio, natural completion, brief source reselection,
and a boundary outside the hidden interval must fail their specific oracle.

Keep the raw geckodriver/public-popup actor. Add passive media and source-page
observation; no polling, extension messages or keepalive during the 90-second
window. Use the existing fixture's audio override with shorter WAV clips.
Navigation/reload remain separate visible-source phases, each restarted through
public popup controls. Check document URL and time origin around those actions.

Export the evidence predicates from the existing journey for one standalone
plant suite. Rebuild before discovering artifact hashes. Release browser and
fixture before fallible log writes; propagate fixture bind errors to BLOCKED.

Validate syntax, Biome, evidence plants, seeded properties and real Firefox;
retain anomalous receipts and report full-gate prerequisites independently.
