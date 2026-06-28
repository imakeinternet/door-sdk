// `bbs-door publish` — packs a door and POSTs it to a catalog with a bearer token.
// We stand up a throwaway HTTP server to capture the request rather than hit a
// real board.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publish } from '../src/publish.mjs';

async function makeDoor() {
  const dir = await mkdtemp(join(tmpdir(), 'pubdoor-'));
  await writeFile(
    join(dir, 'door.json'),
    JSON.stringify({ slug: 'pubtest', name: 'Pub Test', entry: 'pubtest.door.js', version: '1.0.0', apiVersion: 1 })
  );
  await writeFile(
    join(dir, 'pubtest.door.js'),
    "import { door } from '@imakeinternet/door-sdk';\nexport default door({ name: 'X', play() {} });\n"
  );
  return dir;
}

test('publish packs and POSTs the archive with a bearer token', async () => {
  const received = {};
  const server = http.createServer((req, res) => {
    received.method = req.method;
    received.url = req.url;
    received.auth = req.headers['authorization'];
    received.contentType = req.headers['content-type'] || '';
    let size = 0;
    req.on('data', (c) => (size += c.length));
    req.on('end', () => {
      received.bodySize = size;
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: 'Published — pending operator approval.',
          data: { slug: 'pubtest', version: '1.0.0', status: 'pending' },
        })
      );
    });
  });
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();

  const dir = await makeDoor();
  const out = await publish(dir, {
    registry: `http://127.0.0.1:${port}`,
    token: 'bbsd_secrettoken',
    changelog: 'first release',
  });

  server.close();

  assert.equal(received.method, 'POST');
  assert.equal(received.url, '/catalog/doors');
  assert.equal(received.auth, 'Bearer bbsd_secrettoken');
  assert.ok(received.contentType.startsWith('multipart/form-data'));
  assert.ok(received.bodySize > 0);
  assert.equal(out.result.data.status, 'pending');
});

test('publish requires a registry and a token', async () => {
  const dir = await makeDoor();
  await assert.rejects(() => publish(dir, { token: 'x' }), /registry/);
  await assert.rejects(() => publish(dir, { registry: 'http://x' }), /token/);
});
