// `bbs-door validate` / `bbs-door pack` — the authoring-side packaging tools.
//
// validate(): check a door folder's door.json against the manifest rules, that
//   its entry file exists and parses, so a dev catches mistakes before shipping.
// pack(): produce a distributable `<slug>-<version>.door` archive (a gzipped tar
//   of the whitelisted door files) plus its sha256, the unit a store publishes
//   and a board installs. Packing always validates (for publish) first.
//
// The manifest checks here mirror door.schema.json; the schema is the documented
// contract + editor support, this is the runnable gate (no JSON-Schema runtime
// dependency, just the one `tar` dep for archive creation).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { HOST_API_VERSION } from '../index.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Only these files travel in a `.door`; everything else in a folder is dev cruft
// (saves, node_modules, dotfiles) and is left out of the package.
const PACKABLE = (name) =>
  name === 'door.json' ||
  name === 'README' ||
  name.startsWith('README.') ||
  name.endsWith('.door.js') ||
  name.endsWith('.ans');

/** Resolve a door target (folder or *.door.js file) to { dir, slug, manifest }. */
async function resolveDoor(target) {
  const abs = resolve(process.cwd(), target);
  const info = await stat(abs).catch(() => null);
  if (!info) throw new Error(`no such path: ${abs}`);
  const dir = info.isDirectory() ? abs : dirname(abs);
  const manifestPath = join(dir, 'door.json');
  let manifest = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (e) {
      throw new Error(`door.json is not valid JSON: ${e.message}`);
    }
  }
  return { dir, manifest, slug: manifest.slug || basename(dir) };
}

/** Find the entry file for a manifest, or null if it cannot be resolved. */
async function resolveEntry(dir, manifest) {
  if (manifest.entry) {
    const p = join(dir, basename(manifest.entry));
    return existsSync(p) ? p : null;
  }
  const slugEntry = join(dir, `${manifest.slug || basename(dir)}.door.js`);
  if (existsSync(slugEntry)) return slugEntry;
  const files = await readdir(dir);
  const found = files.find((f) => f.endsWith('.door.js'));
  return found ? join(dir, found) : null;
}

/**
 * Collect the manifest problems for a door folder. `forPublish` additionally
 * requires version + apiVersion (a hand-installed local door may omit them).
 * Returns a list of human-readable error strings ([] means valid).
 */
export function manifestErrors(manifest, { forPublish = false } = {}) {
  const errors = [];
  const m = manifest || {};

  if (typeof m.slug !== 'string' || !SLUG_RE.test(m.slug)) {
    errors.push('slug is required and must match ^[a-z0-9][a-z0-9-]*$');
  }
  if (typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push('name is required');
  }
  if (m.entry !== undefined && (typeof m.entry !== 'string' || !m.entry.endsWith('.door.js'))) {
    errors.push('entry, if set, must be a *.door.js filename');
  }
  if (m.version !== undefined && (typeof m.version !== 'string' || !SEMVER_RE.test(m.version))) {
    errors.push('version must be a semver string like 1.0.0');
  }
  if (m.apiVersion !== undefined && (!Number.isInteger(m.apiVersion) || m.apiVersion < 1)) {
    errors.push('apiVersion must be a positive integer');
  }
  if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.some((t) => typeof t !== 'string'))) {
    errors.push('tags must be an array of strings');
  }
  if (m.apiVersion !== undefined && Number.isInteger(m.apiVersion) && m.apiVersion !== HOST_API_VERSION) {
    errors.push(
      `apiVersion ${m.apiVersion} does not match this SDK's Host API ${HOST_API_VERSION}`
    );
  }

  if (forPublish) {
    if (m.version === undefined) errors.push('version is required to publish');
    if (m.apiVersion === undefined) errors.push('apiVersion is required to publish');
  }

  return errors;
}

// Syntax-check the entry as an ES module (no import resolution, no execution).
// Piping the source to `--check --input-type=module` forces the module goal so
// `export`/`import` parse correctly and unbalanced code is reliably rejected.
async function syntaxCheck(file) {
  const source = await readFile(file, 'utf8');
  return new Promise((resolveCheck) => {
    const child = spawn(process.execPath, ['--check', '--input-type=module'], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolveCheck(code === 0 ? null : stderr.trim()));
    child.on('error', (e) => resolveCheck(e.message));
    child.stdin.end(source);
  });
}

/**
 * Validate a door folder. Resolves, checks the manifest, the entry's existence
 * and syntax. Returns { ok, errors, dir, slug, manifest, entry }.
 */
export async function validate(target, { forPublish = false } = {}) {
  const { dir, manifest, slug } = await resolveDoor(target);
  const errors = manifestErrors(manifest, { forPublish });

  const entry = await resolveEntry(dir, manifest);
  if (entry === null) {
    errors.push(`no entry file found (looked for door.json "entry" or a *.door.js in ${dir})`);
  } else {
    const syntax = await syntaxCheck(entry);
    if (syntax) errors.push(`entry ${basename(entry)} has a syntax error:\n${syntax}`);
  }

  return { ok: errors.length === 0, errors, dir, slug, manifest, entry };
}

/**
 * Pack a validated door folder into `<slug>-<version>.door` (a gzipped tar of
 * the whitelisted files). Returns { file, checksum, files }.
 */
export async function pack(target, { outDir } = {}) {
  const { tarCreate } = await loadTar();
  const result = await validate(target, { forPublish: true });
  if (!result.ok) {
    const e = new Error(`cannot pack — the door has validation errors:\n  - ${result.errors.join('\n  - ')}`);
    e.errors = result.errors;
    throw e;
  }

  const { dir, manifest, slug } = result;
  const files = (await readdir(dir)).filter(PACKABLE).sort();
  const out = join(resolve(process.cwd(), outDir || dir), `${slug}-${manifest.version}.door`);

  await tarCreate({ gzip: true, file: out, cwd: dir, portable: true }, files);

  const checksum = createHash('sha256').update(await readFile(out)).digest('hex');
  return { file: out, checksum, files };
}

// Lazily load the `tar` dependency so `validate` works even before `npm install`.
async function loadTar() {
  try {
    const tar = await import('tar');
    return { tarCreate: tar.create ?? tar.c };
  } catch {
    throw new Error("the 'tar' package is required to pack — run `npm install` in packages-js/door-sdk");
  }
}
