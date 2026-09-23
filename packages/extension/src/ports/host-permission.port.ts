/**
 * Runtime host-permission validation (REQ-002).
 *
 * Non-prompting containment check only: prompting, manifest host-permission
 * wiring and any live enablement are separately governed (T003 gate; settings
 * and UI slices). `contains` must fail closed — never prompt, never throw.
 */
export interface IHostPermissions {
  /** @param originPattern exact-origin match pattern, e.g. `https://host:8443/*` */
  contains(originPattern: string): Promise<boolean>;
}
