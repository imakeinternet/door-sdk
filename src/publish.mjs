// `bbs-door publish` — pack a door and upload it to a catalog.
//
// Packs the folder (which validates it for publish), then POSTs the resulting
// `.door` archive to `<registry>/catalog/doors` as multipart form data, authed
// with a bearer token. The token is never written to stdout/stderr — only the
// resulting catalog URL + status are printed.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pack } from './pack.mjs';

/**
 * Pack `target` and publish it to a catalog.
 *
 * @param {string} target  door folder (or *.door.js)
 * @param {{ registry?: string, token?: string, changelog?: string }} opts
 * @returns {Promise<{ file: string, checksum: string, url: string, result: any }>}
 */
export async function publish(target, { registry, token, changelog } = {}) {
  if (!registry) throw new Error('a --registry <url> is required');
  if (!token) throw new Error('a publish token is required (--token or BBS_CATALOG_TOKEN)');

  // Pack first — this validates the door for publish before anything is uploaded.
  const { file, checksum, files } = await pack(target);

  const bytes = await readFile(file);
  const form = new FormData();
  form.append('archive', new Blob([bytes]), basename(file));
  if (changelog) form.append('changelog', changelog);

  const url = registry.replace(/\/+$/, '') + '/catalog/doors';

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: form,
    });
  } catch (e) {
    throw new Error(`could not reach the catalog at ${url}: ${e.message}`);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    throw new Error(`catalog refused the publish (HTTP ${response.status}): ${body.message ?? text}`);
  }

  return { file, checksum, files, url, result: body };
}
