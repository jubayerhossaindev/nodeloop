#!/usr/bin/env node
/**
 * build-native.ts — build the `nodeloop-native` N-API addon and stage it
 * under the file name Node's dlopen loader requires (*.node). Idempotent.
 *
 *   node tooling/scripts/build-native.ts             # release build
 *   NODELOOP_NATIVE_PROFILE=debug node tooling/scripts/build-native.ts
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const profile = process.env.NODELOOP_NATIVE_PROFILE ?? 'release';
if (profile !== 'release' && profile !== 'debug') {
  console.error("NODELOOP_NATIVE_PROFILE must be 'release' or 'debug'");
  process.exit(2);
}

const build = spawnSync(
  'cargo',
  ['build', ...(profile === 'release' ? ['--release'] : []), '-p', 'nodeloop-native'],
  { stdio: 'inherit' }
);
if (build.status !== 0) process.exit(build.status ?? 1);

const out = path.join(ROOT, 'target', profile);
const src =
  process.platform === 'darwin'
    ? path.join(out, 'libnodeloop_native.dylib')
    : process.platform === 'win32'
      ? path.join(out, 'nodeloop_native.dll')
      : path.join(out, 'libnodeloop_native.so');

if (!fs.existsSync(src)) {
  console.error(`cargo did not produce ${src}`);
  process.exit(1);
}

const dst = path.join(out, 'nodeloop_native.node');
fs.copyFileSync(src, dst);
console.log(`staged: ${dst}`);
