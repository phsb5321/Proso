import type { IHostPermissions } from '../../ports/host-permission.port';

/**
 * browser.permissions.contains — non-prompting runtime validation only
 * (REQ-002). Fails closed on any API error: an unprovable permission is a
 * denied permission. Prompting and manifest wiring are not part of this
 * adapter.
 */
export class BrowserHostPermissions implements IHostPermissions {
  async contains(originPattern: string): Promise<boolean> {
    try {
      return await browser.permissions.contains({ origins: [originPattern] });
    } catch {
      return false;
    }
  }
}
