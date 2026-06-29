# @imakeinternet/door-sdk

[![npm version](https://img.shields.io/npm/v/@imakeinternet/door-sdk.svg)](https://www.npmjs.com/package/@imakeinternet/door-sdk)
[![node](https://img.shields.io/node/v/@imakeinternet/door-sdk.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/npm/l/@imakeinternet/door-sdk.svg)](./LICENSE)

> Write a BBS door game in JavaScript and run it locally — no board required.

The SDK + CLI from **[iMakeInternet](https://github.com/imakeinternet)** for authoring
**doors** — the small text games a bulletin board hands a player's terminal to. You write
plain, *synchronous* code against a typed Host API; the runtime sandboxes it
(quickjs-emscripten, deny-by-default — no fs, no net, no timers) and the gateway streams
your ANSI to the player and feeds you their input.

## Install

```bash
npm install -g @imakeinternet/door-sdk   # puts the `bbs-door` CLI on your PATH
```

Requires Node.js ≥ 20. Prefer no global install? Use `npx @imakeinternet/door-sdk <command>`.

## Quick start

```bash
bbs-door new my-door     # scaffold ./my-door  (door.json + my-door.door.js)
bbs-door dev my-door     # play it in your terminal; hot-reloads on every save
```

`new` writes a runnable door you can edit immediately. `dev` runs it in the *same* sandbox a
board uses, so what you see locally is exactly what players get — no board, no account, no
network needed.

## Write a door

A door is a folder with a `*.door.js` entry plus a `door.json` manifest. The entry
default-exports `door({ name, play })`. Your `play(ctx)` runs **synchronously** — input reads
look blocking because the host transparently suspends the sandbox while it waits. No `async`,
no `await`, no promises.

```js
// hello.door.js
import { door } from "@imakeinternet/door-sdk";

export default door({
  name: "Hello",
  summary: "The smallest possible door.",
  play(ctx) {
    ctx.screen.clear();
    ctx.screen.color("  Welcome!\r\n\r\n", "bold", "cyan");

    const name = ctx.input.line("  Your name? ");           // reads as if it blocks
    const pick = ctx.menu("Pick one", ["Gold", "Glory"]);   // returns the chosen index

    ctx.player.score = (ctx.player.score || 0) + (pick === 0 ? 10 : 5);
    ctx.player.save();                                       // persists per (player, door)

    ctx.screen.say(`\r\n  Nice to meet you, ${name}. Score: ${ctx.player.score}.`);
  },
});
```

### A fuller example — menu loop, save, leaderboard, broadcast

The bundled `examples/dice` door: a menu loop, a numeric save field that feeds the world
leaderboard, and a board-wide broadcast on a big win. (`Math.random` inside the sandbox is
host-seeded, so games stay fair and reproducible.)

```js
import { door } from "@imakeinternet/door-sdk";

const d6 = () => 1 + Math.floor(Math.random() * 6);

export default door({
  name: "High Roller",
  summary: "Roll against the house.",
  play(ctx) {
    ctx.player.wins = ctx.player.wins || 0;

    while (true) {
      ctx.screen.clear();
      ctx.screen.color("  H I G H   R O L L E R\r\n\r\n", "bold", "yellow");
      ctx.screen.say(`  Wins: ${ctx.player.wins}\r\n`);

      const choice = ctx.menu("What now?", ["Roll the dice", "Leaderboard", "Cash out"]);
      if (choice === 2) break;                              // Cash out

      if (choice === 1) {                                   // Leaderboard
        const top = ctx.world.leaderboard({ field: "wins", limit: 5 });
        top.forEach((row, i) => ctx.screen.say(`   ${i + 1}. ${row.handle} — ${row.score}`));
        ctx.input.key();                                    // "press any key"
        continue;
      }

      const you = d6() + d6();
      const house = d6() + d6();
      ctx.screen.say(`\r\n  You rolled ${you}; the house rolled ${house}.`);

      if (you > house) {
        ctx.player.wins += 1;
        ctx.player.save();
        ctx.screen.color("  You win!\r\n", "bold", "green");
        if (you === 12) ctx.world.broadcast(`${ctx.player.handle} rolled boxcars in High Roller!`);
      } else {
        ctx.screen.color("  The house takes it.\r\n", "red");
      }
      ctx.input.key();
    }
  },
});
```

The `hello` and `dice` examples ship inside the package (and live in the
[repo](https://github.com/imakeinternet/door-sdk/tree/main/examples)). With a local install
you can play one straight away:

```bash
bbs-door dev node_modules/@imakeinternet/door-sdk/examples/dice
```

### Types & editor support

Doors ship as `.js`, but the bundled `.d.ts` gives you full autocomplete and type-checking.
`door<S>()` types `ctx.player` as your own save shape plus the read-only `handle` and `save()`:

```ts
import { door } from "@imakeinternet/door-sdk";

type Save = { wins: number };

export default door<Save>({
  name: "High Roller",
  play(ctx) {
    ctx.player.wins ??= 0;        // typed as number
    ctx.player.save();            // ctx.player.handle is readonly
  },
});
```

## The Host API (`ctx`)

| Area | Methods |
|------|---------|
| `ctx.screen` | `write(text)` · `say(text?)` · `clear()` · `art(name)` · `color(text, …styles)` · `paint/sgr(…styles)` |
| `ctx.input`  | `key()` · `line(prompt?)` · `number(prompt?, fallback?)` · `confirm(prompt?)` |
| `ctx.menu(prompt, options)` | renders a lightbar; returns the chosen index (0-based) |
| `ctx.player` | your save blob + `save()` and a read-only `handle` |
| `ctx.world`  | `broadcast(text)` (board-wide, rate-limited) · `leaderboard({ field, limit })` → `{ handle, score }[]` |
| conveniences | `ctx.say` · `ctx.write` · `ctx.clear` · `ctx.log` · `ctx.door` (`{ slug, name, handle }`) |

Styles for `color` / `paint` / `sgr`: `bold` `dim` `underline` `reverse`, the eight
foreground colors (`red` `green` `yellow` `blue` `magenta` `cyan` `white` `black`) and their
`bg…` background variants.

Limits enforced by the runtime + host: a per-turn CPU deadline, a memory cap, an output flood
cap, a 16 KB save-blob cap, and broadcast rate limiting. A door that loops, floods, or crashes
is killed without touching the gateway or other players.

## The manifest (`door.json`)

```jsonc
{
  "slug": "my-door",          // required — ^[a-z0-9][a-z0-9-]*$, the folder + registry key
  "name": "My Door",          // required — display name
  "entry": "my-door.door.js", // optional — defaults to <slug>.door.js
  "summary": "One line.",     // optional — shown in listings
  "description": "Longer.",   // optional — store detail page
  "author": "you",            // optional
  "version": "1.0.0",         // semver — REQUIRED to publish
  "apiVersion": 1,            // Host API major — REQUIRED to publish (see below)
  "category": "rpg",          // optional — coarse store grouping
  "tags": ["lord", "rpg"],    // optional
  "license": "MIT",           // optional — SPDX id
  "homepage": "https://..."   // optional
}
```

The schema lives in `door.schema.json` (Draft-07) — point your editor at it for autocomplete
and validation.

### Host API version

`apiVersion` is the Host API **major** your door targets; this SDK exports the one it speaks
as `HOST_API_VERSION`. A board refuses to launch a door whose major doesn't match — a clean
"needs a board update" message instead of a mid-game crash. Build against the
`HOST_API_VERSION` your SDK ships and you're compatible with any board on that major.

## CLI reference

```bash
bbs-door new <name>         # scaffold a door folder (door.json + <slug>.door.js)
bbs-door dev <path>         # play locally with hot-reload (no board)
bbs-door validate <path>    # check the manifest + that the entry loads
bbs-door pack <path>        # build a distributable <slug>-<version>.door (+ sha256)
bbs-door publish <path>     # pack and upload to a catalog
bbs-door help
```

| Command | Useful flags |
|---------|--------------|
| `dev`      | `--handle <name>` — play as a given handle (default `devuser`) |
| `validate` | `--publish` — also require `version` + `apiVersion` (store-publish rules) |
| `pack`     | `--out <dir>` — where to write the `.door` (default: the door folder) |
| `publish`  | `--registry <url>` (required) · `--token <token>` (or `BBS_CATALOG_TOKEN`) · `--changelog <text>` |

### Package & publish

```bash
bbs-door validate ./my-door --publish       # manifest + entry + version/apiVersion
bbs-door pack ./my-door                      # → my-door-1.0.0.door  (+ sha256)
bbs-door publish ./my-door \
  --registry https://your-board.example \
  --token "$BBS_CATALOG_TOKEN" \
  --changelog "First release"
```

A `.door` is a gzipped tar of the door's files (`door.json`, `*.door.js`, `*.ans`, `README*`)
— the unit a board's **door store** installs. A sysop can install one directly
(`bbs:door:install my-door-1.0.0.door`) or browse a store and install from there. The publish
token is issued by the catalog operator; the CLI never prints it.

---

Made by **[Mike Wojcik](https://github.com/imakeinternet)** under the **iMakeInternet** brand · [MIT licensed](./LICENSE) · [Changelog](./CHANGELOG.md)
