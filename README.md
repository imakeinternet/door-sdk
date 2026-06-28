# @imakeinternet/door-sdk

[![npm version](https://img.shields.io/npm/v/@imakeinternet/door-sdk.svg)](https://www.npmjs.com/package/@imakeinternet/door-sdk)
[![node](https://img.shields.io/node/v/@imakeinternet/door-sdk.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/npm/l/@imakeinternet/door-sdk.svg)](./LICENSE)

> Write a BBS door game in JavaScript and run it locally — no board required.

The SDK + CLI from **[iMake Internet](https://github.com/imakeinternet)** for authoring
**doors** — the small text games a bulletin board hands a player's terminal to. You write
plain, *synchronous* code against a typed Host API; the runtime sandboxes it
(quickjs-emscripten, deny-by-default — no fs, no net, no timers) and the gateway streams
your ANSI to the player and feeds you their input.

## Install

```bash
npm install -g @imakeinternet/door-sdk   # puts the `bbs-door` CLI on your PATH
```

Requires Node.js ≥ 20. Prefer no global install? Use `npx @imakeinternet/door-sdk <command>`.

## Write one

```js
// hello.door.js
import { door } from "@imakeinternet/door-sdk";

export default door({
  name: "Hello",
  play(ctx) {
    ctx.screen.clear();
    ctx.screen.color("  Welcome!\r\n\r\n", "bold", "cyan");

    const name = ctx.input.line("  Your name? ");            // reads as if it blocks
    const pick = ctx.menu("Pick one", ["Gold", "Glory"]);    // returns the index

    ctx.player.score = (ctx.player.score || 0) + (pick === 0 ? 10 : 5);
    ctx.player.save();                                        // persists per (player, door)

    ctx.screen.say(`\r\n  Nice to meet you, ${name}. Score: ${ctx.player.score}.`);
  },
});
```

Doors are **synchronous** — `ctx.input.line()` / `ctx.menu()` look blocking
because the host transparently suspends the sandbox while it waits. No `async`,
no `await`, no promises.

## Run it

```bash
bbs-door dev ./hello.door.js     # plays in your terminal, hot-reloads on save
bbs-door new my-door             # scaffold a folder (door.json + my-door.door.js)
```

A door ships as a folder: `*.door.js` + a `door.json` manifest + optional `.ans`
art. See `examples/` for `hello` (the minimum) and `dice` (menu + leaderboard +
broadcast).

## The manifest (`door.json`)

```jsonc
{
  "slug": "my-door",        // required — ^[a-z0-9][a-z0-9-]*$, the folder + registry key
  "name": "My Door",        // required — display name
  "entry": "my-door.door.js", // optional — defaults to <slug>.door.js
  "summary": "One line.",   // optional — shown in listings
  "description": "Longer.", // optional — store detail page
  "author": "you",          // optional
  "version": "1.0.0",       // semver — REQUIRED to publish
  "apiVersion": 1,          // Host API major — REQUIRED to publish (see below)
  "category": "rpg",        // optional — coarse store grouping
  "tags": ["lord", "rpg"],  // optional
  "license": "MIT",         // optional — SPDX id
  "homepage": "https://..." // optional
}
```

The schema lives in `door.schema.json` (Draft-07) — point your editor at it for
autocomplete and validation.

### Host API version

`apiVersion` is the Host API **major** your door targets; this SDK exports the one
it speaks as `HOST_API_VERSION`. A board refuses to launch a door whose major does
not match — a clean "needs a board update" message instead of a mid-game crash.
Build against the `HOST_API_VERSION` your SDK ships and you are compatible with any
board on that major.

## Package & publish

```bash
bbs-door validate ./my-door            # manifest + entry sanity
bbs-door validate ./my-door --publish  # also require version + apiVersion
bbs-door pack ./my-door                # → my-door-1.0.0.door  (+ sha256)
```

A `.door` is a gzipped tar of the door's files (`door.json`, `*.door.js`, `*.ans`,
`README*`) — the unit a board's **door store** publishes and installs. A sysop can
install one directly (`bbs:door:install my-door-1.0.0.door`) or browse a store and
install from there. Publishing to a store is `bbs-door publish` (see the board's
door-developer docs).

## The Host API (`ctx`)

| Area | Verbs |
|------|-------|
| `ctx.screen` | `write` · `say` · `clear` · `art(name)` · `color(text, …styles)` |
| `ctx.input`  | `key()` · `line(prompt?)` · `number(prompt?, fallback?)` · `confirm(prompt?)` |
| `ctx.menu(prompt, options)` | renders a lightbar, returns the chosen index |
| `ctx.player` | your save blob + `save()` and a read-only `handle` |
| `ctx.world`  | `broadcast(text)` (board-wide, rate-limited) · `leaderboard({field})` |

Limits enforced by the runtime + host: per-turn CPU deadline, memory cap, output
flood cap, a 16 KB save blob cap, and broadcast rate limiting. A door that loops,
floods, or crashes is killed without touching the gateway or other players.

---

Made by **[iMake Internet](https://github.com/imakeinternet)** · [MIT licensed](./LICENSE) · [Changelog](./CHANGELOG.md)
