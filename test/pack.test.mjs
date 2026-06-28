// Tests for the authoring-side packaging tools. Run with: node --test test/
//
// These need the `tar` dependency installed (`npm install` in this folder).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestErrors, validate, pack } from '../src/pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(HERE, '..', 'examples');

async function fixtureDoor(manifest, source = "import { door } from '@imakeinternet/door-sdk';\nexport default door({ name: 'X', play() {} });\n") {
  const dir = await mkdtemp(join(tmpdir(), 'sdk-'));
  if (manifest) await writeFile(join(dir, 'door.json'), JSON.stringify(manifest));
  const entry = (manifest && manifest.entry) || `${(manifest && manifest.slug) || 'x'}.door.js`;
  await writeFile(join(dir, entry), source);
  return dir;
}

test('manifestErrors accepts a complete v2 manifest', () => {
  const errors = manifestErrors({
    slug: 'demo', name: 'Demo', version: '1.2.3', apiVersion: 1,
  }, { forPublish: true });
  assert.deepEqual(errors, []);
});

test('manifestErrors flags a bad slug, bad semver, and api mismatch', () => {
  const errors = manifestErrors({ slug: 'Bad Slug', name: 'X', version: 'v1', apiVersion: 2 });
  assert.ok(errors.some((e) => /slug/.test(e)));
  assert.ok(errors.some((e) => /semver|version/.test(e)));
  assert.ok(errors.some((e) => /apiVersion .*does not match/.test(e)));
});

test('manifestErrors requires version + apiVersion only for publish', () => {
  const m = { slug: 'demo', name: 'Demo' };
  assert.deepEqual(manifestErrors(m), []);
  const pub = manifestErrors(m, { forPublish: true });
  assert.ok(pub.some((e) => /version is required to publish/.test(e)));
  assert.ok(pub.some((e) => /apiVersion is required to publish/.test(e)));
});

test('validate passes on the bundled hello example', async () => {
  const result = await validate(join(EXAMPLES, 'hello'), { forPublish: true });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.slug, 'hello');
});

test('validate catches a syntax error in the entry', async () => {
  const dir = await fixtureDoor({ slug: 'broken', name: 'Broken' }, 'export default door({ play( {');
  const result = await validate(dir);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /syntax error/.test(e)));
});

test('pack builds a gzipped .door for a valid door and refuses an invalid one', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'out-'));

  const good = await pack(join(EXAMPLES, 'dice'), { outDir });
  assert.match(good.file, /dice-1\.0\.0\.door$/);
  assert.match(good.checksum, /^[0-9a-f]{64}$/);
  const head = (await readFile(good.file)).subarray(0, 2);
  assert.equal(head[0], 0x1f); // gzip magic
  assert.equal(head[1], 0x8b);
  assert.ok((await stat(good.file)).size > 0);

  const dir = await fixtureDoor({ slug: 'nover', name: 'No Version' }); // missing version/apiVersion
  await assert.rejects(() => pack(dir, { outDir }), /validation errors/);
});
