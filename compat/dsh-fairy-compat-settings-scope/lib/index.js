/**
 * Host half of dsh-fairy-compat-settings-scope.
 *
 * The shim is purely a browser-side service provider: the legacy `settingsScope`
 * client service is reconstructed in `lib/client.js` from services the 0.2.1
 * client already has. There is nothing to do on the host, but the Loader row
 * must still mount a real module (see FINDINGS.md for the wiring).
 */

export const name = 'dsh-fairy-compat-settings-scope';

export function apply() {
  // Intentionally empty. No host service, no settings namespace of our own.
  return undefined;
}
