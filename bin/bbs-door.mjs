#!/usr/bin/env node
// bbs-door — the door author's CLI.
//
//   bbs-door dev <path>        play a door locally (hot-reload, no board)
//   bbs-door new <name>        scaffold a new door folder
//   bbs-door validate <path>   check the manifest + entry before shipping
//   bbs-door pack <path>       build a distributable <slug>-<version>.door
//   bbs-door publish <path>    pack and upload to a catalog
//   bbs-door help

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { dev } from '../src/dev.mjs';
import { pack, validate } from '../src/pack.mjs';
import { publish } from '../src/publish.mjs';
import { HOST_API_VERSION } from '../index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function usage() {
  process.stdout.write(`bbs-door — author BBS door games

Usage:
  bbs-door dev <path>        Play a door locally with hot-reload (no board needed)
  bbs-door new <name>        Scaffold a new door folder
  bbs-door validate <path>   Check the manifest + entry (use --publish for store rules)
  bbs-door pack <path>       Build a distributable <slug>-<version>.door archive
  bbs-door publish <path>    Pack and upload the door to a catalog
  bbs-door help              Show this help

Options for dev:
  --handle <name>            Player handle to run as (default: devuser)

Options for validate:
  --publish                  Also require version + apiVersion (store-publish rules)

Options for pack:
  --out <dir>                Directory to write the .door into (default: the door folder)

Options for publish:
  --registry <url>           The catalog base URL to publish to (required)
  --token <token>            A publish token (or set BBS_CATALOG_TOKEN)
  --changelog <text>         Release notes for this version
`);
}

async function scaffold(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dir = resolve(process.cwd(), slug);
  if (existsSync(dir)) { console.error(`refusing to overwrite existing ${dir}`); process.exit(1); }
  await mkdir(dir, { recursive: true });

  const title = slug.replace(/(^|-)(\w)/g, (_, _d, c) => ' ' + c.toUpperCase()).trim();
  const template = await readFile(join(HERE, '..', 'templates', 'door.door.js'), 'utf8');
  await writeFile(join(dir, `${slug}.door.js`), template.replaceAll('__NAME__', title).replaceAll('__SLUG__', slug));
  await writeFile(join(dir, 'door.json'), JSON.stringify({
    slug,
    name: title,
    entry: `${slug}.door.js`,
    summary: `A brand new door called ${title}.`,
    description: `${title} — describe your door here so players know what to expect.`,
    author: 'you',
    version: '0.1.0',
    apiVersion: HOST_API_VERSION,
    category: 'misc',
    tags: [],
    license: 'MIT',
  }, null, 2) + '\n');

  console.log(`Created ${slug}/`);
  console.log(`  ${slug}.door.js`);
  console.log(`  door.json`);
  console.log(`\nPlay it:  bbs-door dev ${slug}`);
  console.log(`Ship it:  bbs-door pack ${slug}`);
}

const [, , cmd, ...rest] = process.argv;

function flag(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
}

function has(name) {
  return rest.includes(`--${name}`);
}

function target() {
  return rest.find((a) => !a.startsWith('--'));
}

switch (cmd) {
  case 'dev': {
    const t = target();
    if (!t) { usage(); process.exit(1); }
    await dev(t, { handle: flag('handle', 'devuser') });
    break;
  }
  case 'new': {
    if (!rest[0]) { usage(); process.exit(1); }
    await scaffold(rest[0]);
    break;
  }
  case 'validate': {
    const t = target();
    if (!t) { usage(); process.exit(1); }
    const result = await validate(t, { forPublish: has('publish') });
    if (result.ok) {
      console.log(`✓ ${result.slug} is valid${has('publish') ? ' and ready to publish' : ''}.`);
    } else {
      console.error(`✗ ${result.slug || t} has problems:`);
      for (const e of result.errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    break;
  }
  case 'pack': {
    const t = target();
    if (!t) { usage(); process.exit(1); }
    try {
      const { file, checksum } = await pack(t, { outDir: flag('out') });
      console.log(`✓ packed ${file}`);
      console.log(`  sha256 ${checksum}`);
    } catch (e) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case 'publish': {
    const t = target();
    if (!t) { usage(); process.exit(1); }
    try {
      const { file, checksum, url, result } = await publish(t, {
        registry: flag('registry'),
        token: flag('token') ?? process.env.BBS_CATALOG_TOKEN,
        changelog: flag('changelog'),
      });
      console.log(`✓ packed ${file}`);
      console.log(`  sha256 ${checksum}`);
      console.log(`✓ published to ${url}`);
      if (result?.data) console.log(`  ${result.data.slug}@${result.data.version} — ${result.data.status}`);
      if (result?.message) console.log(`  ${result.message}`);
    } catch (e) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case 'help':
  case '--help':
  case undefined:
    usage();
    break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    usage();
    process.exit(1);
}
