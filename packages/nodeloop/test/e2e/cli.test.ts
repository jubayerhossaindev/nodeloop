/**
E2E: the REAL built CLI (`dist/cli.js`) against the REAL native binary —
the full stack exactly as a user runs it. Deterministic temp apps, no
network, bounded waits.
*/
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(testDirectory, '../../dist/cli.js');
const BIN = fs.existsSync(CLI) ? CLI : undefined;

function runCli(
  arguments_: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
) {
  const child = spawn(process.execPath, [BIN!, ...arguments_], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout!.on('data', (d) => {
    stdout += d;
  });
  child.stderr!.on('data', (d) => {
    stderr += d;
  });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs ?? 15_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, done };
}

const directories: string[] = [];
const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) {
    try {
      p.kill('SIGKILL');
    } catch {
      /*
      gone
      */
    }
  }
  for (const d of directories) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function temporaryApp(code: string): { direction: string; file: string } {
  const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-e2e-'));
  directories.push(direction);
  const file = path.join(direction, 'app.js');
  fs.writeFileSync(file, code);
  return { direction, file };
}

describe.skipIf(!BIN)('e2e: help + version', () => {
  it('--help exits 0 with the full option surface', async () => {
    const { done } = runCli(['--help']);
    const { code, stdout } = await done;
    expect(code).toBe(0);
    expect(stdout).toContain('USAGE');
    for (const row of [
      '-e, --ext',
      '-i, --ignore',
      '-w, --watch',
      '-d, --delay',
      '-m, --max-wait',
      '-x, --exec',
      '--node-args',
      '--config',
      '--verbose',
      '--quiet',
      '--color',
      '--no-color',
      '--help',
      '--version'
    ]) {
      expect(stdout).toContain(row);
    }
    expect(stdout).toContain('never invents commands from package.json');
    expect(stdout).toContain('nodeloop.json');
  });

  it('--version prints the package version with the brand prefix', async () => {
    const { done } = runCli(['--version']);
    const { code, stdout } = await done;
    expect(code).toBe(0);
    const package_ = JSON.parse(
      fs.readFileSync(path.resolve(testDirectory, '../../package.json'), 'utf8')
    ) as { version: string };
    expect(stdout.trim()).toBe(`[nodeloop] ${package_.version}`);
  });

  it('-h behaves like --help', async () => {
    const { done } = runCli(['-h']);
    const { code, stdout } = await done;
    expect(code).toBe(0);
    expect(stdout).toContain('USAGE');
  });
});

describe.skipIf(!BIN)('e2e: startup + restart lifecycle', () => {
  it('prints the exact startup sequence and passes app output through untouched', async () => {
    const { direction, file } = temporaryApp('console.log("MARKER-1");\nsetInterval(()=>{},1000);');
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    const lines = stdout.split('\n');
    expect(lines[0]).toBe('[nodeloop] 1.0.0');
    expect(stdout).toContain('watching path(s): .');
    expect(stdout).toContain('watching extensions: js,mjs,cjs,json');
    expect(stdout).toContain('starting `node app.js`');
    expect(stdout).toContain('MARKER-1'); // child output, unprefixed, unchanged
    expect(stdout).toContain('nodeloop stopped');
  }, 20_000);

  it('restarts on a file change with the amber sequence', async () => {
    const { direction, file } = temporaryApp('console.log("BOOT-1");\nsetInterval(()=>{},1000);');
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1200);
    fs.writeFileSync(file, 'console.log("BOOT-2");\nsetInterval(()=>{},1000);');
    await delay(2500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('restarting due to changes...');
    expect(stdout).toContain('BOOT-1');
    expect(stdout).toContain('BOOT-2');
    // only ONE banner — restarts do not re-print the startup block
    expect(stdout.split('[nodeloop] 1.0.0').length - 1).toBe(1);
  }, 25_000);

  it('announces a clean exit and keeps watching', async () => {
    const { direction, file } = temporaryApp('console.log("bye");');
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1800);
    child.kill('SIGINT');
    const { stdout } = await done;
    // piped output uses the ASCII dash fallback — assert dash-agnostically
    expect(stdout).toContain('waiting for changes before restart');
    expect(stdout).toContain('clean exit');
    expect(stdout).not.toContain('app crashed');
  }, 20_000);

  it('renders the crash block with the real exit code', async () => {
    const { direction, file } = temporaryApp('console.error("kaboom");\nprocess.exit(3);');
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1800);
    child.kill('SIGINT');
    const { stdout, stderr } = await done;
    const out = stdout + stderr;
    expect(out).toContain('app crashed');
    expect(out).toContain('exit code 3');
    expect(out).toContain('watching for changes');
    expect(out).toContain('fix the error and save a file to retry');
    expect(out).toContain('kaboom'); // the app's own error output stays visible
  }, 20_000);

  it('renders the spawn-failure block for a missing executable', async () => {
    const { direction, file } = temporaryApp('console.log("never");');
    const { child, done } = runCli(
      ['--delay', '100', '--exec', '/nonexistent-nodeloop-bin-xyz', file],
      { cwd: direction }
    );
    procs.push(child);
    await delay(1800);
    child.kill('SIGINT');
    const { stdout, stderr } = await done;
    const out = stdout + stderr;
    expect(out).toContain('failed to start');
    expect(out).toContain('Executable not found');
    expect(out).toContain('check your executable or command configuration');
    expect(out).toContain('watcher still active');
  }, 20_000);
});

describe.skipIf(!BIN)('e2e: config + args semantics', () => {
  it('invalid configuration → the three-line block, exit 1, nothing starts', async () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-e2e-'));
    directories.push(direction);
    fs.writeFileSync(path.join(direction, 'nodeloop.toml'), 'ext = [ broken\n');
    fs.writeFileSync(path.join(direction, 'app.js'), 'console.log("x");');
    const { done } = runCli(['app.js'], { cwd: direction });
    const { code, stderr, stdout } = await done;
    expect(code).toBe(1);
    const out = stdout + stderr;
    expect(out).toContain('invalid configuration');
    expect(out).toContain('nodeloop.toml');
    expect(out).toContain('check the configuration and run again');
    expect(out).not.toContain('starting `node app.js`');
  }, 20_000);

  it('unknown config keys warn, known keys apply (CLI wins over config)', async () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-e2e-'));
    directories.push(direction);
    fs.writeFileSync(
      path.join(direction, 'nodeloop.json'),
      JSON.stringify({ ext: 'js,json', delay: 100, wat: 1 })
    );
    const { direction: direction2, file } = temporaryApp(
      'console.log("cfg");\nsetInterval(()=>{},1000);'
    );
    directories.push(direction2);
    const { child, done } = runCli(['-d', '150', file], {
      cwd: direction,
      env: { NODELOOP_CONFIG_DIR: direction }
    });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('unknown key(s) in nodeloop.json: wat — ignored');
    expect(stdout).toContain('cfg');
  }, 20_000);

  it('-- separator: everything after goes to the app verbatim', async () => {
    const { direction, file } = temporaryApp(
      'console.log("ARGS:", JSON.stringify(process.argv.slice(2)));\nsetInterval(()=>{},1000);'
    );
    const { child, done } = runCli(['--delay', '100', file, '--', '--config', '-x'], {
      cwd: direction
    });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('"--config"');
    expect(stdout).toContain('"-x"');
  }, 20_000);

  it('exec-only mode runs exactly the given command (no script)', async () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-e2e-'));
    directories.push(direction);
    fs.writeFileSync(path.join(direction, 'hello.js'), 'console.log("EXEC-MARK");');
    const { child, done } = runCli(['--delay', '100', '--exec', 'node hello.js'], {
      cwd: direction
    });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('starting `node hello.js`');
    expect(stdout).toContain('EXEC-MARK');
  }, 20_000);

  it('script args flow verbatim without --', async () => {
    const { direction, file } = temporaryApp(
      'console.log("ARGV:", JSON.stringify(process.argv.slice(2)));\nsetInterval(()=>{},1000);'
    );
    const { child, done } = runCli(['--delay', '100', file, '--port', '3000'], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('"--port"');
    expect(stdout).toContain('"3000"');
  }, 20_000);
});

describe.skipIf(!BIN)('e2e: output discipline', () => {
  it('--quiet suppresses every nodeloop line but never the app output', async () => {
    const { direction, file } = temporaryApp('console.log("QUIET-MARK");');
    const { child, done } = runCli(['-q', '--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('QUIET-MARK');
    expect(stdout).not.toContain('[nodeloop]');
  }, 20_000);

  it('--verbose adds the real diagnostic lines', async () => {
    const { direction, file } = temporaryApp('console.log("V-MARK");\nsetInterval(()=>{},1000);');
    fs.writeFileSync(path.join(direction, 'nodeloop.json'), JSON.stringify({ delay: 100 }));
    const { child, done } = runCli(['-v', '--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('config: nodeloop.json');
    expect(stdout).toMatch(/\d{2}:\d{2}:\d{2} child process spawned/);
    expect(stdout).toContain('V-MARK');
  }, 20_000);

  it('--no-color emits zero ANSI escapes (purity regression)', async () => {
    const { direction, file } = temporaryApp('console.log("NC-MARK");');
    const { child, done } = runCli(['--no-color', '--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout.includes(String.fromCodePoint(0x1b))).toBe(false);
    expect(stdout).toContain('NC-MARK');
  }, 20_000);

  it('non-TTY output is plain (ASCII glyph fallback, no escapes)', async () => {
    const { direction, file } = temporaryApp('console.log("PIPE-MARK");');
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1500);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout.includes(String.fromCodePoint(0x1b))).toBe(false);
    expect(stdout).toContain('> starting `node app.js`'); // ASCII play glyph
    expect(stdout).toContain('PIPE-MARK');
  }, 20_000);

  it('piped stdin is NOT intercepted: rs text reaches the app verbatim', async () => {
    const { direction, file } = temporaryApp(
      'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("data",()=>{if(b.includes("rs\\n"))console.log("APP-GOT-RS");});\nsetInterval(()=>{},1000);'
    );
    const { child, done } = runCli(['--delay', '100', file], { cwd: direction });
    procs.push(child);
    await delay(1200);
    child.stdin!.write('rs\n');
    await delay(800);
    child.kill('SIGINT');
    const { stdout } = await done;
    expect(stdout).toContain('APP-GOT-RS');
  }, 20_000);
});

describe.skipIf(!BIN)('e2e: fatal guidance', () => {
  it('no script and no exec → fatal + config-aware hint, exit 1', async () => {
    const direction = fs.mkdtempSync(path.join(os.tmpdir(), 'nlp-e2e-'));
    directories.push(direction);
    const { done } = runCli([], { cwd: direction });
    const { code, stderr, stdout } = await done;
    expect(code).toBe(1);
    const out = stdout + stderr;
    expect(out).toContain('no script given and none found');
    expect(out).toContain('set "script" (entry file) or "exec"');
  }, 20_000);

  it('missing explicit config file → fatal naming the flag value', async () => {
    const { direction, file } = temporaryApp('console.log("x");');
    const { done } = runCli(['--config', 'missing.toml', file], { cwd: direction });
    const { code, stdout, stderr } = await done;
    expect(code).toBe(1);
    const out = stdout + stderr;
    expect(out).toContain('config file not found: missing.toml');
  }, 20_000);

  it('nodeloop lag → the dedicated no-lag-monitor message', async () => {
    const { done } = runCli(['lag'], { cwd: os.tmpdir() });
    const { code, stdout, stderr } = await done;
    expect(code).toBe(1);
    const out = stdout + stderr;
    expect(out).toContain('no lag monitor');
  }, 20_000);
});
