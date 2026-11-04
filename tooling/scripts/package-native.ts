#!/usr/bin/env node
/**
 * package-native.ts — copy the built nodeloop_native.node into the platform
 * package that matches the HOST machine. CI's native matrix runs this per
 * runner, then publishes. (Publishing itself is gated on maintainer
 * approval — never done by this script.)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const bin = path.join(ROOT, 'target', 'release', 'nodeloop_native.node');
if (!fs.existsSync(bin)) {
  console.error('run `npm run build:native` first (target/release/nodeloop_native.node missing)');
  process.exit(1);
}

const host = `${os.platform()}-${os.arch()}`;
const table: Record<string, string> = {
  'darwin-arm64': 'packages/native/darwin-arm64',
  'darwin-x64': 'packages/native/darwin-x64',
  'linux-x64': 'packages/native/linux-x64-gnu',
  'linux-arm64': 'packages/native/linux-arm64-gnu',
  'win32-x64': 'packages/native/win32-x64-msvc',
  'win32-arm64': 'packages/native/win32-arm64-msvc'
};

const rel = table[host];
if (!rel) {
  console.error(`unsupported host: ${host}`);
  process.exit(1);
}

fs.copyFileSync(bin, path.join(ROOT, rel, 'nodeloop_native.node'));
console.log(`packaged: ${rel}/nodeloop_native.node`);
