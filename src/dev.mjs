// `bbs-door dev <path>` — play a door locally with no board, hot-reloading on
// save. This is a *host*: it spawns the shared door-runtime runner and services
// the exact same Host API RPC the gateway does, but renders to the local TTY and
// keeps saves in a JSON file. Same runner, same protocol → if it runs here, it
// runs on the board.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { watch, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { openTty } from './tty.mjs';
import { cp437ToUtf8 } from './cp437.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const RUNNER = process.env.BBS_DOOR_RUNNER || join(REPO_ROOT, 'services/door-runtime/src/runner.mjs');
const SAVE_CAP = 16 * 1024;

const ESC = '\x1b';
const dim = (t) => `${ESC}[2m${t}${ESC}[0m`;
const yellow = (t) => `${ESC}[33m${t}${ESC}[0m`;
const cyan = (t) => `${ESC}[36m${t}${ESC}[0m`;

/** Resolve a door target (folder or file) to { entry, dir, slug, name, manifest }. */
async function resolveDoor(target) {
  const abs = resolve(process.cwd(), target);
  let entry, dir;
  const info = await stat(abs);
  if (info.isDirectory()) {
    dir = abs;
    const manifestPath = join(dir, 'door.json');
    let manifest = {};
    if (existsSync(manifestPath)) manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.entry) entry = join(dir, manifest.entry);
    else {
      const files = await readdir(dir);
      const found = files.find((f) => f.endsWith('.door.js'));
      if (!found) throw new Error(`no *.door.js (or door.json "entry") found in ${dir}`);
      entry = join(dir, found);
    }
    return {
      entry, dir,
      slug: manifest.slug || basename(dir),
      name: manifest.name || basename(dir),
      manifest,
    };
  }
  dir = dirname(abs);
  return { entry: abs, dir, slug: basename(abs).replace(/\.door\.js$/, ''), name: basename(abs), manifest: {} };
}

function loadSaves(saveFile) {
  if (!existsSync(saveFile)) return {};
  try { return JSON.parse(readFileSync(saveFile, 'utf8')); } catch { return {}; }
}

export async function dev(target, { handle = 'devuser' } = {}) {
  const door = await resolveDoor(target);
  const saveFile = join(door.dir, '.bbs-door-save.json');
  const tty = openTty();

  let runner = null;
  let restarting = false;

  const hostVerbs = {
    'screen.write': ({ text }) => { tty.write(String(text)); },
    'screen.say': ({ text }) => { tty.write(String(text) + '\r\n'); },
    'screen.clear': () => { tty.write(`${ESC}[2J${ESC}[H`); },
    'screen.art': async ({ name }) => {
      const safe = basename(String(name)); // no traversal
      const path = join(door.dir, safe);
      if (!existsSync(path)) { tty.write(dim(`[missing art: ${safe}]`) + '\r\n'); return; }
      tty.write(cp437ToUtf8(await readFile(path)));
    },
    'input.key': () => tty.readKey(),
    'input.line': async ({ prompt }) => {
      if (prompt) tty.write(String(prompt));
      return tty.readLine();
    },
    menu: async ({ prompt, options }) => {
      tty.write('\r\n' + cyan(String(prompt)) + '\r\n');
      options.forEach((o, i) => tty.write(`  ${yellow(`[${i + 1}]`)} ${o}\r\n`));
      while (true) {
        tty.write(`Choose [1-${options.length}]: `);
        const line = (await tty.readLine()).trim();
        const n = parseInt(line, 10);
        if (Number.isFinite(n) && n >= 1 && n <= options.length) return n - 1;
        tty.write(dim('  invalid choice') + '\r\n');
      }
    },
    'player.get': () => loadSaves(saveFile)[door.slug] || {},
    'player.save': async ({ state }) => {
      const json = JSON.stringify(state ?? {});
      if (Buffer.byteLength(json, 'utf8') > SAVE_CAP) {
        throw new Error(`save blob too large (> ${SAVE_CAP} bytes)`);
      }
      const all = loadSaves(saveFile);
      all[door.slug] = state ?? {};
      await writeFile(saveFile, JSON.stringify(all, null, 2));
    },
    'world.broadcast': ({ text }) => { tty.write('\r\n' + dim(`[board] ${text}`) + '\r\n'); },
    'world.leaderboard': ({ field }) => {
      const state = loadSaves(saveFile)[door.slug] || {};
      const score = Number(state?.[field] ?? 0);
      return [{ handle, score }];
    },
    log: ({ text }) => { process.stderr.write(dim(`[door] ${text}`) + '\n'); },
  };

  function runOnce() {
    return new Promise((resolveRun) => {
      const meta = Buffer.from(JSON.stringify({ handle, slug: door.slug, name: door.name })).toString('base64');
      runner = spawn(process.execPath, [RUNNER, door.entry, meta], { stdio: ['pipe', 'pipe', 'inherit'] });
      const rl = createInterface({ input: runner.stdout });

      rl.on('line', async (line) => {
        if (!line.trim()) return;
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.end) { resolveRun(msg); return; }
        if (!msg.verb) return;
        const fn = hostVerbs[msg.verb];
        try {
          if (!fn) throw new Error(`unknown verb ${msg.verb}`);
          const result = await fn(msg.payload || {});
          runner.stdin.write(JSON.stringify({ id: msg.id, ok: true, result }) + '\n');
        } catch (e) {
          runner.stdin.write(JSON.stringify({ id: msg.id, ok: false, error: e.message }) + '\n');
        }
      });

      runner.on('exit', (code) => { if (!restarting) resolveRun({ end: true, ok: code === 0, code }); });
    });
  }

  async function loop() {
    while (true) {
      tty.write(`${ESC}[2J${ESC}[H`);
      tty.write(dim(`▶ ${door.name}  —  bbs-door dev  (Ctrl-C to quit, save the file to reload)`) + '\r\n\r\n');
      const outcome = await runOnce();
      if (outcome.ok) {
        tty.write('\r\n' + dim('— door exited. Save the file to replay, or Ctrl-C to quit. —') + '\r\n');
      } else {
        tty.write('\r\n' + `${ESC}[31m` + dim(`door ended with an error: ${outcome.error || outcome.code}`) + `${ESC}[0m` + '\r\n');
      }
      // Wait for a file change to replay.
      await waitForChange(door.dir);
    }
  }

  let changeWaiters = [];
  let watcher;
  function startWatch(dir) {
    let timer = null;
    watcher = watch(dir, { recursive: false }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = changeWaiters; changeWaiters = [];
        w.forEach((r) => r());
      }, 120);
    });
  }
  function waitForChange() {
    return new Promise((r) => changeWaiters.push(() => {
      restarting = true;
      if (runner && runner.exitCode === null) runner.kill('SIGKILL');
      restarting = false;
      r();
    }));
  }

  startWatch(door.dir);
  process.stderr.write(dim(`[bbs-door] runner: ${RUNNER}`) + '\n');
  await loop();
  watcher?.close();
  tty.close();
}
