// @imakeinternet/door-sdk — author-facing entry point.
//
// This is the package a door author imports. The `door()` helper is identical
// to the one the sandbox resolves at runtime (see services/door-runtime's
// vm-sdk.js): it simply returns the config, which the runtime reads. Keeping the
// helper here too means `import { door } from "@imakeinternet/door-sdk"` type-checks and
// resolves in an author's editor and under `bbs-door dev`.

/**
 * The Host API major version this SDK targets. A door declares the API it was
 * built against via `apiVersion` in its `door.json`; the board's runtime refuses
 * to launch a door whose major does not match, rather than crashing mid-game.
 * Bump this only on a breaking Host API change. Pinned in lock-step with
 * services/door-runtime/src/runner.mjs and PHP `config('bbs.doors.api_version')`.
 * @type {number}
 */
export const HOST_API_VERSION = 1;

/**
 * Define a door game. Returns the config unchanged; the runtime invokes `play`.
 * @template S
 * @param {import('./index.d.ts').DoorConfig<S>} config
 * @returns {import('./index.d.ts').DoorConfig<S>}
 */
export function door(config) {
  return config;
}

export default door;
