// @imakeinternet/door-sdk — TypeScript types for the Host API.
//
// A door is plain *synchronous* code. Every `ctx` method does its work through a
// single host bridge that transparently suspends the sandbox VM for the duration
// of the host round-trip (ANSI out, input back), so there are no promises to
// await — you read input as if it were blocking.

export type StyleName =
  | 'reset' | 'bold' | 'dim' | 'underline' | 'reverse'
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'bgBlack' | 'bgRed' | 'bgGreen' | 'bgYellow' | 'bgBlue' | 'bgMagenta' | 'bgCyan' | 'bgWhite';

export interface Screen {
  /** Write raw text (may include ANSI) with no trailing newline. */
  write(text: string): void;
  /** Write a line of text followed by CRLF. */
  say(text?: string): void;
  /** Alias of `say`. */
  line(text?: string): void;
  /** Clear the screen and home the cursor. */
  clear(): void;
  /** Load an `.ans` from the door folder, transcode CP437, and stream it. */
  art(name: string): void;
  /** Write `text` wrapped in the given styles, then reset. */
  color(text: string, ...styles: StyleName[]): void;
  /** Build an SGR escape sequence from style tokens. */
  sgr(...styles: StyleName[]): string;
  /** Wrap text in styles and append a reset (returns the string). */
  paint(text: string, ...styles: StyleName[]): string;
}

export interface Input {
  /** Block for one keypress; returns the key (a character or a token like "UP"). */
  key(): string;
  /** Prompt (optional) and read a line of input with echo. */
  line(prompt?: string): string;
  /** Read a line and parse it as an integer, falling back to `fallback`. */
  number(prompt?: string, fallback?: number): number;
  /** Read a line and return true if it starts with y/Y. */
  confirm(prompt?: string): boolean;
}

export interface World {
  /** Push a one-line notice to every node currently online (rate-limited). */
  broadcast(text: string): void;
  /** Top players across all saves of this door, by a numeric save field. */
  leaderboard(opts?: { limit?: number; field?: string }): Array<{ handle: string; score: number }>;
}

/** The per-user save blob: your own fields plus `handle` and `save()`. */
export type Player<S> = S & {
  readonly handle: string;
  /** Persist the player's current fields (size-capped by the host). */
  save(): void;
};

export interface DoorContext<S = Record<string, unknown>> {
  door: { handle: string; slug: string; name: string };
  screen: Screen;
  input: Input;
  /** Present a prompt with options; returns the chosen index (0-based). */
  menu(prompt: string, options: string[]): number;
  player: Player<S>;
  world: World;
  // conveniences
  say(text?: string): void;
  write(text: string): void;
  clear(): void;
  log(text: string): void;
}

export interface DoorConfig<S = Record<string, unknown>> {
  name: string;
  /** Optional one-line description shown in the door listing. */
  summary?: string;
  /** Optional author credit. */
  author?: string;
  /** The game. Runs synchronously; read input as if it blocks. */
  play(ctx: DoorContext<S>): void;
}

export function door<S = Record<string, unknown>>(config: DoorConfig<S>): DoorConfig<S>;
export default door;

/**
 * The Host API major version this SDK targets. The board's runtime refuses a
 * door whose `door.json` `apiVersion` major does not match.
 */
export const HOST_API_VERSION: number;

/**
 * The on-disk `door.json` manifest. `slug`, `name`, and `entry` identify and
 * locate the door; `version` + `apiVersion` are required to publish to a store.
 * Everything else is optional metadata surfaced in listings.
 */
export interface DoorManifest {
  /** URL-safe identity, `^[a-z0-9][a-z0-9-]*$`. The folder + registry key. */
  slug: string;
  /** Display name. */
  name: string;
  /** Entry file relative to the door folder, e.g. `my-door.door.js`. */
  entry?: string;
  /** One-line description for listings. */
  summary?: string;
  /** Longer prose description for the store detail page. */
  description?: string;
  /** Author credit. */
  author?: string;
  /** Semver, e.g. `1.0.0`. Required to publish. */
  version?: string;
  /** Host API major this door targets. Required to publish. */
  apiVersion?: number;
  /** A coarse grouping for the store, e.g. `casino`, `rpg`, `utility`. */
  category?: string;
  /** Free-form search tags. */
  tags?: string[];
  /** SPDX license id, e.g. `MIT`. */
  license?: string;
  /** Project/source URL. */
  homepage?: string;
}
