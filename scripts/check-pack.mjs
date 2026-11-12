#!/usr/bin/env node
// Fails if the npm tarball would ship anything that looks like a secret.
// Usage: npm run build && npm run check:pack
//   - no .env*, *.pem, *.key, .npmrc, src/, test/ or coverage files in the tarball
//   - no canary storeKey (TEST_STOREKEY_CANARY_123) in any shipped file
//   - no key-like literals: storeKey / CMI_STORE_KEY assignments other than documented placeholders
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANARY = 'TEST_STOREKEY_CANARY_123';
const PLACEHOLDERS = /^(storeKey|YOUR_STORE_KEY|your[-_]store[-_]key|your_store_key_here|\*+|\$\{.*\}|process\.env\..*)$/i;
const FORBIDDEN_PATH = /(^|\/)(\.env[^/]*|[^/]*\.pem|[^/]*\.key|\.npmrc)$|^(coverage|src|test)\//i;
const KEY_LITERAL = /(store_?key|CMI_STORE_KEY)["']?\s*[:=]\s*["']([^"'\s]{6,})["']/gi;
const NUL = String.fromCharCode(0);

/** Minimal reader for the ustar archives npm produces: yields [path, contents]. */
function* tarEntries(buffer) {
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => {
      const text = header.subarray(start, start + length).toString('utf8');
      const end = text.indexOf(NUL);
      return end === -1 ? text : text.slice(0, end);
    };
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    offset += 512;
    if (type === '0' || type === '') yield [name.replace(/^package\//, ''), buffer.subarray(offset, offset + size)];
    offset += Math.ceil(size / 512) * 512;
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dir = mkdtempSync(join(tmpdir(), 'cmi-pack-'));
const problems = [];

try {
  const [pack] = JSON.parse(
    execFileSync(npm, ['pack', '--json', '--pack-destination', dir], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
  );
  for (const file of pack.files) {
    if (FORBIDDEN_PATH.test(file.path)) problems.push(`forbidden file in tarball: ${file.path}`);
  }

  for (const [name, contents] of tarEntries(gunzipSync(readFileSync(join(dir, pack.filename))))) {
    const text = contents.toString('utf8');
    if (text.includes(CANARY)) problems.push(`canary storeKey found in ${name}`);
    for (const match of text.matchAll(KEY_LITERAL)) {
      if (!PLACEHOLDERS.test(match[2])) {
        problems.push(`key-like literal in ${name}: ${match[1]} = "${match[2].slice(0, 2)}…" (${match[2].length} chars)`);
      }
    }
  }

  if (problems.length) {
    console.error(`✗ npm tarball check failed (${pack.filename}, ${pack.entryCount} files):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ npm tarball check passed: ${pack.filename}, ${pack.entryCount} files, no secrets or forbidden files`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
