#!/usr/bin/env node
/**
 * nodemon-vs-nodeloop-benchmark.ts — Comprehensive benchmark comparing
 * nodemon and nodeloop on startup, memory, CPU, and shutdown.
 * File change detection may not work in container environments without
 * inotify support; those metrics are reported as N/A when not measurable.
 */

/**
 * Comprehensive Nodeloop vs Nodemon benchmark.
 *
 * Metrics:
 * - Launcher spawn -> application ready latency
 * - Startup with configurable numbers of existing files
 * - Process-tree RSS / PSS / USS / swap (where the OS exposes them)
 * - Process-tree CPU time, average CPU, peak sampled CPU
 * - Idle watcher CPU and memory
 * - Process and thread counts
 * - Graceful shutdown time and leftover-process detection
 * - File-change detection and restart latency
 * - Median, mean, standard deviation, p95, p99, min, max and raw samples
 *
 * Important:
 * - Linux process metrics are read from /proc and measure the detached
 *   process group created for each benchmark run.
 * - macOS process metrics are read with ps.
 * - Windows process metrics are read through PowerShell/CIM. This sampler is
 *   slower, so its larger sampling interval is reported in the output.
 * - Unsupported process metrics are returned as null, never as fabricated 0s.
 * - Startup timing is measured from immediately before spawn() until a unique
 *   READY marker emitted by the target application.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const NODELOOP_CLI = path.resolve(process.env.NODELOOP_CLI ?? 'packages/nodeloop/dist/cli.js');
const RUNS = readPositiveInteger('BENCH_RUNS', 5);
const DELAY_MS = readPositiveInteger('BENCH_DELAY', 200);
const TIMEOUT_MS = readPositiveInteger('BENCH_TIMEOUT_MS', 60_000);
const WATCH_TIMEOUT_MS = readPositiveInteger('BENCH_WATCH_TIMEOUT_MS', 15_000);
const IDLE_WINDOW_MS = readPositiveInteger('BENCH_IDLE_WINDOW_MS', 1_000);
const RESTARTS_PER_RUN = readPositiveInteger('BENCH_RESTARTS', 3);
const NO_CHANGE_WINDOW_MS = readPositiveInteger('BENCH_NO_CHANGE_WINDOW_MS', 750);
const WATCH_SETTLE_MS = readPositiveInteger('BENCH_WATCH_SETTLE_MS', Math.max(500, DELAY_MS * 2));
const SHUTDOWN_TIMEOUT_MS = readPositiveInteger('BENCH_SHUTDOWN_TIMEOUT_MS', 8_000);
const FILE_COUNTS = readFileCounts(process.env.BENCH_FILE_COUNTS ?? '100,500,1000');
const OUTPUT_JSON = path.resolve(
  process.env.BENCH_OUTPUT_JSON ?? 'benchmarks/results/nodemon-vs-nodeloop.json'
);
const FORCE_COLOR = '0';

const SAMPLE_INTERVAL_MS = getDefaultSampleInterval();

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received: ${raw}`);
  }

  return value;
}

function readFileCounts(raw: string): number[] {
  const values = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    throw new Error('BENCH_FILE_COUNTS must contain comma-separated positive integers.');
  }

  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
      throw new Error(`Invalid file count: ${value}. Allowed range: 0-10000.`);
    }
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function getDefaultSampleInterval(): number {
  if (process.platform === 'linux') return 100;
  if (process.platform === 'darwin') return 250;
  if (process.platform === 'win32') return 500;
  return 500;
}

// -----------------------------------------------------------------------------
// Tool resolution
// -----------------------------------------------------------------------------

interface ToolConfig {
  name: ToolName;
  cliPath: string;
  getArgs: (fixture: Fixture, watchFileOnly?: boolean) => string[];
}

type ToolName = 'nodeloop' | 'nodemon';

function resolveNodemonCli(): string {
  const explicitPath = process.env.NODEMON_CLI;
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`NODEMON_CLI does not exist: ${resolved}`);
    }
    return resolved;
  }

  const projectRequire = createRequire(path.join(PROJECT_ROOT, 'package.json'));
  const candidates = ['nodemon/bin/nodemon.js', 'nodemon'];

  for (const candidate of candidates) {
    try {
      const resolved = projectRequire.resolve(candidate);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // Try the next resolution strategy.
    }
  }

  throw new Error(
    'Could not resolve Nodemon from this project. Install it locally or set NODEMON_CLI.'
  );
}

function resolveTools(): Record<ToolName, ToolConfig> {
  if (!fs.existsSync(NODELOOP_CLI)) {
    throw new Error(
      `Nodeloop CLI was not found: ${NODELOOP_CLI}\n` +
        'Build Nodeloop first, or set NODELOOP_CLI to the correct CLI path.'
    );
  }

  const nodemonCli = resolveNodemonCli();

  return {
    nodeloop: {
      name: 'nodeloop',
      cliPath: NODELOOP_CLI,
      getArgs: (fixture, watchFileOnly = false) => [
        '-d',
        String(DELAY_MS),
        '-w',
        watchFileOnly ? 'watched.js' : fixture.directory,
        'app.js'
      ]
    },
    nodemon: {
      name: 'nodemon',
      cliPath: nodemonCli,
      getArgs: (fixture, watchFileOnly = false) => [
        '--delay',
        String(DELAY_MS / 1000),
        '--watch',
        watchFileOnly ? 'watched.js' : fixture.directory,
        'app.js'
      ]
    }
  };
}

// -----------------------------------------------------------------------------
// Shared types and statistics
// -----------------------------------------------------------------------------

interface NumericStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  standardDeviation: number;
  p95: number;
  p99: number;
  samples: number[];
}

interface ReadyEvent {
  version: number;
  pid: number;
  atMs: number;
}

interface ProcessSnapshot {
  atMs: number;
  processCount: number;
  threadCount: number | null;
  rssKb: number;
  pssKb: number | null;
  ussKb: number | null;
  swapKb: number | null;
  cpuTimeMs: number;
  voluntaryContextSwitches: number | null;
  involuntaryContextSwitches: number | null;
}

interface ResourceMetrics {
  supported: boolean;
  method: string;
  sampleIntervalMs: number;
  sampleCount: number;
  idleRssKb: number | null;
  averageRssKb: number | null;
  peakRssKb: number | null;
  peakPssKb: number | null;
  peakUssKb: number | null;
  peakSwapKb: number | null;
  averageCpuPct: number | null;
  peakCpuPct: number | null;
  idleAverageCpuPct: number | null;
  cpuTimeMs: number | null;
  peakProcessCount: number | null;
  peakThreadCount: number | null;
  voluntaryContextSwitches: number | null;
  involuntaryContextSwitches: number | null;
  errors: string[];
}

interface StartupRun {
  startupMs: number;
  startupCpuMs: number | null;
  resources: ResourceMetrics;
}

interface FileStartupRun {
  startupMs: number;
  peakRssKb: number | null;
  peakCpuPct: number | null;
  peakProcessCount: number | null;
}

interface ShutdownRun {
  shutdownMs: number | null;
  graceful: boolean;
  forcedCleanup: boolean;
  processesRemainingBeforeForce: number | null;
  resources: ResourceMetrics;
  error?: string;
}

interface RestartRun {
  noChangeWindowMs: number;
  unexpectedRestarts: number;
  attempted: number;
  succeeded: number;
  failed: number;
  latencyMs: number[];
  errors: string[];
}

interface ToolRuns<T> {
  nodeloop: T[];
  nodemon: T[];
  errors: Record<ToolName, string[]>;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function calculateStats(values: number[]): NumericStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;

  return {
    count: sorted.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    median: round(median),
    standardDeviation: round(Math.sqrt(variance)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    samples: sorted.map((value) => round(value))
  };
}

function aggregateOptional(values: Array<number | null | undefined>): NumericStats | null {
  return calculateStats(
    values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  );
}

function ratio(nodeloopValue: number | null, nodemonValue: number | null) {
  if (
    nodeloopValue === null ||
    nodemonValue === null ||
    !Number.isFinite(nodeloopValue) ||
    !Number.isFinite(nodemonValue) ||
    nodeloopValue < 0 ||
    nodemonValue < 0
  ) {
    return {
      nodeloopToNodemon: null,
      fasterTool: null,
      speedupFactor: null,
      nodeloopPercentFaster: null
    };
  }

  if (nodeloopValue === 0 && nodemonValue === 0) {
    return { nodeloopToNodemon: 1, fasterTool: 'tie', speedupFactor: 1, nodeloopPercentFaster: 0 };
  }

  if (nodeloopValue === 0 || nodemonValue === 0) {
    return {
      nodeloopToNodemon: nodemonValue === 0 ? null : 0,
      fasterTool: nodeloopValue === 0 ? 'nodeloop' : 'nodemon',
      speedupFactor: null,
      nodeloopPercentFaster: nodemonValue === 0 ? null : 100
    };
  }

  return {
    nodeloopToNodemon: round(nodeloopValue / nodemonValue, 3),
    fasterTool:
      nodeloopValue < nodemonValue ? 'nodeloop' : nodeloopValue > nodemonValue ? 'nodemon' : 'tie',
    speedupFactor: round(
      Math.max(nodeloopValue, nodemonValue) / Math.min(nodeloopValue, nodemonValue),
      3
    ),
    nodeloopPercentFaster: round((1 - nodeloopValue / nodemonValue) * 100, 2)
  };
}

// -----------------------------------------------------------------------------
// Process-tree sampler
// -----------------------------------------------------------------------------

function readStatusValue(statusText: string, key: string): number | null {
  const expression = new RegExp(`^${key}:\\s+(\\d+)`, 'm');
  const match = statusText.match(expression);
  return match ? Number(match[1]) : null;
}

function readClockTicksPerSecond(): number {
  if (process.platform !== 'linux') return 100;

  try {
    const value = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
    return Number.isFinite(value) && value > 0 ? value : 100;
  } catch {
    return 100;
  }
}

const CLOCK_TICKS_PER_SECOND = readClockTicksPerSecond();

function parseCpuTimeToMs(value: string): number {
  const trimmed = value.trim();
  const dayParts = trimmed.split('-');
  const days = dayParts.length === 2 ? Number(dayParts[0]) : 0;
  const timePart = dayParts.length === 2 ? dayParts[1] : dayParts[0];
  const segments = timePart.split(':');

  if (segments.length !== 2 && segments.length !== 3) return 0;

  const hours = segments.length === 3 ? Number(segments[0]) : 0;
  const minutes = Number(segments.length === 3 ? segments[1] : segments[0]);
  const seconds = Number(segments.length === 3 ? segments[2] : segments[1]);
  const totalSeconds = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;

  return Number.isFinite(totalSeconds) ? totalSeconds * 1_000 : 0;
}

class ProcessTreeSampler {
  readonly supported: boolean;
  readonly method: string;
  readonly intervalMs: number;

  private readonly rootPid: number;
  private readonly knownPids = new Set<number>();
  private readonly snapshots: ProcessSnapshot[] = [];
  private readonly errors: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(rootPid: number) {
    this.rootPid = rootPid;
    this.intervalMs = SAMPLE_INTERVAL_MS;
    this.knownPids.add(rootPid);

    if (process.platform === 'linux') {
      this.supported = true;
      this.method = '/proc process-group sampler';
    } else if (process.platform === 'darwin') {
      this.supported = true;
      this.method = 'ps process-group sampler';
    } else if (process.platform === 'win32') {
      this.supported = true;
      this.method = 'PowerShell/CIM descendant-process sampler';
    } else {
      this.supported = false;
      this.method = 'unsupported platform';
    }
  }

  start(): void {
    if (!this.supported || this.timer) return;

    this.sampleNow();
    this.timer = setInterval(() => this.sampleNow(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.sampleNow();
  }

  sampleNow(): ProcessSnapshot | null {
    if (!this.supported) return null;

    try {
      let snapshot: ProcessSnapshot;

      if (process.platform === 'linux') {
        snapshot = this.readLinuxSnapshot();
      } else if (process.platform === 'darwin') {
        snapshot = this.readMacSnapshot();
      } else {
        snapshot = this.readWindowsSnapshot();
      }

      this.snapshots.push(snapshot);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.errors.length < 5) this.errors.push(message);
      return null;
    }
  }

  getLastProcessCount(): number | null {
    if (!this.supported || this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1].processCount;
  }

  getKnownPids(): number[] {
    return [...this.knownPids];
  }

  getCpuDeltaMs(startAtMs: number, endAtMs: number): number | null {
    const relevant = this.snapshots.filter(
      (snapshot) =>
        snapshot.processCount > 0 && snapshot.atMs >= startAtMs && snapshot.atMs <= endAtMs
    );

    if (relevant.length < 2) return null;
    return Math.max(0, relevant[relevant.length - 1].cpuTimeMs - relevant[0].cpuTimeMs);
  }

  summarize(idleStartMs?: number, idleEndMs?: number): ResourceMetrics {
    if (
      !this.supported ||
      this.snapshots.length === 0 ||
      !this.snapshots.some((snapshot) => snapshot.processCount > 0)
    ) {
      return {
        supported: false,
        method: this.method,
        sampleIntervalMs: this.intervalMs,
        sampleCount: 0,
        idleRssKb: null,
        averageRssKb: null,
        peakRssKb: null,
        peakPssKb: null,
        peakUssKb: null,
        peakSwapKb: null,
        averageCpuPct: null,
        peakCpuPct: null,
        idleAverageCpuPct: null,
        cpuTimeMs: null,
        peakProcessCount: null,
        peakThreadCount: null,
        voluntaryContextSwitches: null,
        involuntaryContextSwitches: null,
        errors:
          this.errors.length > 0
            ? [...this.errors]
            : ['No matching benchmark process-tree samples were collected.']
      };
    }

    const active = this.snapshots.filter((snapshot) => snapshot.processCount > 0);
    const idle = active.filter(
      (snapshot) =>
        idleStartMs !== undefined &&
        idleEndMs !== undefined &&
        snapshot.atMs >= idleStartMs &&
        snapshot.atMs <= idleEndMs
    );
    const cpuIntervals = this.getCpuIntervals(active);
    const idleCpuIntervals = cpuIntervals.filter(
      (sample) =>
        idleStartMs !== undefined &&
        idleEndMs !== undefined &&
        sample.atMs >= idleStartMs &&
        sample.atMs <= idleEndMs
    );
    const first = active[0];
    const last = active[active.length - 1];

    const cpuTimeMs = first && last ? Math.max(0, last.cpuTimeMs - first.cpuTimeMs) : null;
    const wallTimeMs = first && last ? last.atMs - first.atMs : 0;
    const idleCpuValues = idleCpuIntervals.map((sample) => sample.cpuPct);

    return {
      supported: true,
      method: this.method,
      sampleIntervalMs: this.intervalMs,
      sampleCount: this.snapshots.length,
      idleRssKb:
        idle.length > 0
          ? round(idle.reduce((total, snapshot) => total + snapshot.rssKb, 0) / idle.length)
          : null,
      averageRssKb:
        active.length > 0
          ? round(active.reduce((total, snapshot) => total + snapshot.rssKb, 0) / active.length)
          : null,
      peakRssKb: maxOrNull(active.map((snapshot) => snapshot.rssKb)),
      peakPssKb: maxOrNull(active.map((snapshot) => snapshot.pssKb)),
      peakUssKb: maxOrNull(active.map((snapshot) => snapshot.ussKb)),
      peakSwapKb: maxOrNull(active.map((snapshot) => snapshot.swapKb)),
      averageCpuPct:
        cpuTimeMs !== null && wallTimeMs > 0 ? round((cpuTimeMs / wallTimeMs) * 100) : null,
      peakCpuPct: maxOrNull(cpuIntervals.map((sample) => sample.cpuPct)),
      idleAverageCpuPct:
        idleCpuValues.length > 0
          ? round(idleCpuValues.reduce((total, value) => total + value, 0) / idleCpuValues.length)
          : null,
      cpuTimeMs: cpuTimeMs === null ? null : round(cpuTimeMs),
      peakProcessCount: maxOrNull(active.map((snapshot) => snapshot.processCount)),
      peakThreadCount: maxOrNull(active.map((snapshot) => snapshot.threadCount)),
      voluntaryContextSwitches: deltaOrNull(
        active.map((snapshot) => snapshot.voluntaryContextSwitches)
      ),
      involuntaryContextSwitches: deltaOrNull(
        active.map((snapshot) => snapshot.involuntaryContextSwitches)
      ),
      errors: [...this.errors]
    };
  }

  private getCpuIntervals(snapshots: ProcessSnapshot[]): Array<{ atMs: number; cpuPct: number }> {
    const intervals: Array<{ atMs: number; cpuPct: number }> = [];

    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const elapsedMs = current.atMs - previous.atMs;
      const cpuDeltaMs = current.cpuTimeMs - previous.cpuTimeMs;

      if (elapsedMs <= 0 || cpuDeltaMs < 0) continue;
      intervals.push({
        atMs: current.atMs,
        cpuPct: (cpuDeltaMs / elapsedMs) * 100
      });
    }

    return intervals;
  }

  private readLinuxSnapshot(): ProcessSnapshot {
    const now = performance.now();
    const processIds = fs.readdirSync('/proc').filter((entry) => /^\d+$/.test(entry));
    let processCount = 0;
    let threadCount = 0;
    let rssKb = 0;
    let pssKb = 0;
    let ussKb = 0;
    let swapKb = 0;
    let cpuTimeMs = 0;
    let voluntaryContextSwitches = 0;
    let involuntaryContextSwitches = 0;
    let hasPss = false;
    let hasUss = false;
    let hasContextSwitches = false;

    for (const processId of processIds) {
      const processDirectory = path.join('/proc', processId);
      let statText: string;

      try {
        statText = fs.readFileSync(path.join(processDirectory, 'stat'), 'utf8');
      } catch {
        continue;
      }

      const closingParenthesis = statText.lastIndexOf(')');
      if (closingParenthesis < 0) continue;

      const fields = statText
        .slice(closingParenthesis + 2)
        .trim()
        .split(/\s+/);
      if (fields.length < 22) continue;

      const pid = Number(processId);
      const processGroupId = Number(fields[2]);
      if (processGroupId !== this.rootPid) continue;

      this.knownPids.add(pid);
      processCount += 1;
      cpuTimeMs += ((Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS_PER_SECOND) * 1_000;

      let statusText = '';
      try {
        statusText = fs.readFileSync(path.join(processDirectory, 'status'), 'utf8');
      } catch {
        // The process may have exited between reading stat and status.
      }

      rssKb += readStatusValue(statusText, 'VmRSS') ?? 0;
      swapKb += readStatusValue(statusText, 'VmSwap') ?? 0;
      threadCount += readStatusValue(statusText, 'Threads') ?? Number(fields[17]) ?? 0;

      const voluntary = readStatusValue(statusText, 'voluntary_ctxt_switches');
      const involuntary = readStatusValue(statusText, 'nonvoluntary_ctxt_switches');
      if (voluntary !== null && involuntary !== null) {
        voluntaryContextSwitches += voluntary;
        involuntaryContextSwitches += involuntary;
        hasContextSwitches = true;
      }

      try {
        const smapsText = fs.readFileSync(path.join(processDirectory, 'smaps_rollup'), 'utf8');
        const pss = readStatusValue(smapsText, 'Pss');
        const privateClean = readStatusValue(smapsText, 'Private_Clean');
        const privateDirty = readStatusValue(smapsText, 'Private_Dirty');
        const privateHugetlb = readStatusValue(smapsText, 'Private_Hugetlb') ?? 0;

        if (pss !== null) {
          pssKb += pss;
          hasPss = true;
        }
        if (privateClean !== null && privateDirty !== null) {
          ussKb += privateClean + privateDirty + privateHugetlb;
          hasUss = true;
        }
      } catch {
        // smaps_rollup may be unavailable or restricted; RSS remains usable.
      }
    }

    return {
      atMs: now,
      processCount,
      threadCount,
      rssKb,
      pssKb: hasPss ? pssKb : null,
      ussKb: hasUss ? ussKb : null,
      swapKb,
      cpuTimeMs,
      voluntaryContextSwitches: hasContextSwitches ? voluntaryContextSwitches : null,
      involuntaryContextSwitches: hasContextSwitches ? involuntaryContextSwitches : null
    };
  }

  private readMacSnapshot(): ProcessSnapshot {
    const output = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,time='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024
    });

    let processCount = 0;
    let rssKb = 0;
    let cpuTimeMs = 0;

    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) continue;

      const pid = Number(match[1]);
      const processGroupId = Number(match[3]);
      if (processGroupId !== this.rootPid) continue;

      this.knownPids.add(pid);
      processCount += 1;
      rssKb += Number(match[4]);
      cpuTimeMs += parseCpuTimeToMs(match[5]);
    }

    return {
      atMs: performance.now(),
      processCount,
      threadCount: null,
      rssKb,
      pssKb: null,
      ussKb: null,
      swapKb: null,
      cpuTimeMs,
      voluntaryContextSwitches: null,
      involuntaryContextSwitches: null
    };
  }

  private readWindowsSnapshot(): ProcessSnapshot {
    const script = [
      '$ErrorActionPreference = "Stop";',
      'Get-CimInstance Win32_Process |',
      'Select-Object ProcessId, ParentProcessId, WorkingSetSize, UserModeTime, KernelModeTime, ThreadCount |',
      'ConvertTo-Json -Compress'
    ].join(' ');
    const output = execFileSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 32 * 1024 * 1024
      }
    ).trim();

    const parsed = output
      ? (JSON.parse(output) as Array<Record<string, unknown>> | Record<string, unknown>)
      : [];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = rows.map((row) => ({
      pid: Number(row.ProcessId),
      ppid: Number(row.ParentProcessId),
      rssKb: Number(row.WorkingSetSize ?? 0) / 1024,
      cpuTimeMs: (Number(row.UserModeTime ?? 0) + Number(row.KernelModeTime ?? 0)) / 10_000,
      threads: Number(row.ThreadCount ?? 0)
    }));

    const byPid = new Map(normalized.map((row) => [row.pid, row]));
    let changed = true;

    while (changed) {
      changed = false;
      for (const row of normalized) {
        if (this.knownPids.has(row.ppid) && !this.knownPids.has(row.pid)) {
          this.knownPids.add(row.pid);
          changed = true;
        }
      }
    }

    let processCount = 0;
    let threadCount = 0;
    let rssKb = 0;
    let cpuTimeMs = 0;

    for (const pid of this.knownPids) {
      const row = byPid.get(pid);
      if (!row) continue;
      processCount += 1;
      threadCount += row.threads;
      rssKb += row.rssKb;
      cpuTimeMs += row.cpuTimeMs;
    }

    return {
      atMs: performance.now(),
      processCount,
      threadCount,
      rssKb,
      pssKb: null,
      ussKb: null,
      swapKb: null,
      cpuTimeMs,
      voluntaryContextSwitches: null,
      involuntaryContextSwitches: null
    };
  }
}

function maxOrNull(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length > 0 ? round(Math.max(...valid)) : null;
}

function deltaOrNull(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length < 2) return null;
  return Math.max(0, valid[valid.length - 1] - valid[0]);
}

// -----------------------------------------------------------------------------
// Fixture creation
// -----------------------------------------------------------------------------

let runSequence = 0;

interface Fixture {
  directory: string;
  appFile: string;
  watchedFile: string;
  runId: string;
}

function makeFixture(fileCount = 0): Fixture {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeloop-vs-nodemon-'));
  const appFile = path.join(directory, 'app.js');
  const watchedFile = path.join(directory, 'watched.js');
  const runId = `bench_${process.pid}_${Date.now()}_${(runSequence += 1)}`;

  fs.writeFileSync(watchedFile, 'module.exports = 0;\n');
  fs.writeFileSync(
    appFile,
    [
      "const watchedVersion = require('./watched.js');",
      'const runId = process.env.BENCH_RUN_ID || "missing-run-id";',
      'console.log(`__BENCH_READY__${runId}__${watchedVersion}__${process.pid}`);',
      'process.on("SIGTERM", () => process.exit(0));',
      'process.on("SIGINT", () => process.exit(0));',
      'setInterval(() => {}, 1000);',
      ''
    ].join('\n')
  );

  for (let index = 0; index < fileCount; index += 1) {
    const bucket = Math.floor(index / 100);
    const nestedDirectory = path.join(directory, 'fixtures', `bucket-${bucket}`);
    fs.mkdirSync(nestedDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(nestedDirectory, `file-${index}.js`),
      `module.exports = ${index};\n`
    );
  }

  return { directory, appFile, watchedFile, runId };
}

// -----------------------------------------------------------------------------
// Process launch and READY marker handling
// -----------------------------------------------------------------------------

interface ReadyWaiter {
  targetCount: number;
  timer: NodeJS.Timeout;
  resolve: (event: ReadyEvent) => void;
  reject: (error: Error) => void;
}

interface RunningTool {
  tool: ToolConfig;
  fixture: Fixture;
  child: ChildProcess;
  sampler: ProcessTreeSampler;
  startedAtMs: number;
  readyEvents: ReadyEvent[];
  waitForReady: (targetCount: number, timeoutMs: number) => Promise<ReadyEvent>;
  stderrTail: string;
  exitDescription: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function startTool(
  tool: ToolConfig,
  fileCount = 0,
  watchFileOnly = false
): Promise<RunningTool> {
  const fixture = makeFixture(fileCount);
  const args = [tool.cliPath, ...tool.getArgs(fixture, watchFileOnly)];
  const startedAtMs = performance.now();
  const child = spawn(process.execPath, args, {
    cwd: fixture.directory,
    env: {
      ...process.env,
      FORCE_COLOR,
      CI: '1',
      BENCH_RUN_ID: fixture.runId
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true
  });

  if (!child.pid) {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
    throw new Error(`${tool.name} did not return a child process ID.`);
  }

  const sampler = new ProcessTreeSampler(child.pid);
  sampler.start();
  const readyEvents: ReadyEvent[] = [];
  const waiters: ReadyWaiter[] = [];
  const marker = new RegExp(
    `${escapeRegExp(`__BENCH_READY__${fixture.runId}__`)}(\\d+)__(\\d+)`,
    'g'
  );
  let stdoutBuffer = '';
  let parsedOffset = 0;
  let stderrTail = '';
  let exitDescription: string | null = null;

  const settleWaiters = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (readyEvents.length >= waiter.targetCount) {
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(readyEvents[waiter.targetCount - 1]);
      }
    }
  };

  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutBuffer += chunk.toString();
    marker.lastIndex = parsedOffset;
    let match = marker.exec(stdoutBuffer);

    while (match) {
      readyEvents.push({
        version: Number(match[1]),
        pid: Number(match[2]),
        atMs: performance.now()
      });
      settleWaiters();
      parsedOffset = marker.lastIndex;
      match = marker.exec(stdoutBuffer);
    }

    if (stdoutBuffer.length > 16_384) {
      const trimLength = stdoutBuffer.length - 4_096;
      stdoutBuffer = stdoutBuffer.slice(trimLength);
      parsedOffset = Math.max(0, parsedOffset - trimLength);
    }
  });

  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrTail += chunk.toString();
    if (stderrTail.length > 8_192) stderrTail = stderrTail.slice(-8_192);
  });

  child.on('error', (error) => {
    exitDescription = error.message;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });

  child.on('exit', (code, signal) => {
    exitDescription = `process exited (code=${String(code)}, signal=${String(signal)})`;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(`${tool.name} exited before READY marker: ${exitDescription}\n${stderrTail}`)
      );
    }
  });

  const running: RunningTool = {
    tool,
    fixture,
    child,
    sampler,
    startedAtMs,
    readyEvents,
    stderrTail,
    exitDescription,
    waitForReady: (targetCount, timeoutMs) => {
      if (readyEvents.length >= targetCount) {
        return Promise.resolve(readyEvents[targetCount - 1]);
      }
      if (exitDescription) {
        return Promise.reject(
          new Error(`${tool.name} exited before READY marker: ${exitDescription}\n${stderrTail}`)
        );
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(
            new Error(`${tool.name} did not become ready within ${timeoutMs} ms.\n${stderrTail}`)
          );
        }, timeoutMs);

        waiters.push({ targetCount, timer, resolve, reject });
      });
    }
  };

  try {
    await running.waitForReady(1, TIMEOUT_MS);
    return running;
  } catch (error) {
    await forceCleanup(running);
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5_000
      });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // The process tree may already have exited.
  }
}

async function forceCleanup(running: RunningTool): Promise<void> {
  running.sampler.stop();

  if (running.child.exitCode === null && running.child.signalCode === null) {
    try {
      running.child.kill('SIGKILL');
    } catch {
      // Ignore an already-exited process.
    }
  }

  if (running.child.pid) killProcessTree(running.child.pid, 'SIGKILL');
  await waitForChildExit(running.child, 2_000);
  fs.rmSync(running.fixture.directory, { recursive: true, force: true });
}

async function finishGracefully(running: RunningTool): Promise<{
  shutdownMs: number | null;
  graceful: boolean;
  forcedCleanup: boolean;
  processesRemainingBeforeForce: number | null;
}> {
  const startedAt = performance.now();

  try {
    running.child.kill('SIGTERM');
  } catch {
    // Continue to process-tree checks; it may have exited already.
  }

  const deadline = startedAt + SHUTDOWN_TIMEOUT_MS;
  let emptySnapshots = 0;

  while (performance.now() < deadline) {
    running.sampler.sampleNow();
    const processCount = running.sampler.getLastProcessCount();

    if (processCount === 0) {
      emptySnapshots += 1;
      if (emptySnapshots >= 2) {
        return {
          shutdownMs: round(performance.now() - startedAt),
          graceful: true,
          forcedCleanup: false,
          processesRemainingBeforeForce: 0
        };
      }
    } else if (processCount === null) {
      const exited = await waitForChildExit(running.child, Math.min(250, SHUTDOWN_TIMEOUT_MS));
      if (exited) {
        return {
          shutdownMs: round(performance.now() - startedAt),
          graceful: true,
          forcedCleanup: false,
          processesRemainingBeforeForce: null
        };
      }
    } else {
      emptySnapshots = 0;
    }

    await delay(running.sampler.intervalMs);
  }

  const remaining = running.sampler.getLastProcessCount();
  if (running.child.pid) killProcessTree(running.child.pid, 'SIGKILL');
  try {
    running.child.kill('SIGKILL');
  } catch {
    // Ignore an already-exited process.
  }

  return {
    shutdownMs: null,
    graceful: false,
    forcedCleanup: true,
    processesRemainingBeforeForce: remaining
  };
}

// -----------------------------------------------------------------------------
// Individual benchmark scenarios
// -----------------------------------------------------------------------------

async function benchmarkStartupAndIdle(tool: ToolConfig): Promise<StartupRun> {
  const running = await startTool(tool);

  try {
    const ready = running.readyEvents[0];
    const startupMs = ready.atMs - running.startedAtMs;
    const startupCpuMs = running.sampler.getCpuDeltaMs(running.startedAtMs, ready.atMs);
    const idleStartMs = performance.now();

    await delay(IDLE_WINDOW_MS);
    running.sampler.sampleNow();
    const idleEndMs = performance.now();
    const resources = running.sampler.summarize(idleStartMs, idleEndMs);

    return {
      startupMs: round(startupMs),
      startupCpuMs: startupCpuMs === null ? null : round(startupCpuMs),
      resources
    };
  } finally {
    await forceCleanup(running);
  }
}

async function benchmarkStartupWithFiles(
  tool: ToolConfig,
  fileCount: number
): Promise<FileStartupRun> {
  const running = await startTool(tool, fileCount);

  try {
    const ready = running.readyEvents[0];
    running.sampler.sampleNow();
    const resources = running.sampler.summarize();

    return {
      startupMs: round(ready.atMs - running.startedAtMs),
      peakRssKb: resources.peakRssKb,
      peakCpuPct: resources.peakCpuPct,
      peakProcessCount: resources.peakProcessCount
    };
  } finally {
    await forceCleanup(running);
  }
}

async function benchmarkShutdown(tool: ToolConfig): Promise<ShutdownRun> {
  const running = await startTool(tool);

  try {
    await delay(WATCH_SETTLE_MS);
    const result = await finishGracefully(running);
    running.sampler.stop();

    return {
      ...result,
      resources: running.sampler.summarize()
    };
  } catch (error) {
    return {
      shutdownMs: null,
      graceful: false,
      forcedCleanup: true,
      processesRemainingBeforeForce: null,
      resources: running.sampler.summarize(),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await forceCleanup(running);
  }
}

async function benchmarkRestartLatency(tool: ToolConfig): Promise<RestartRun> {
  // Watch the exact fixture file instead of the whole temporary directory.
  // This avoids recursive-watch and ignored-directory differences between tools.
  const running = await startTool(tool, 0, true);
  const latencyMs: number[] = [];
  const errors: string[] = [];
  let unexpectedRestarts = 0;

  try {
    await delay(WATCH_SETTLE_MS);
    const stableReadyCount = running.readyEvents.length;
    await delay(NO_CHANGE_WINDOW_MS);
    unexpectedRestarts = Math.max(0, running.readyEvents.length - stableReadyCount);

    for (let index = 1; index <= RESTARTS_PER_RUN; index += 1) {
      const triggerAtMs = performance.now();
      fs.writeFileSync(running.fixture.watchedFile, `module.exports = ${index};\n`);

      try {
        const ready = await running.waitForReady(index + 1, WATCH_TIMEOUT_MS);
        latencyMs.push(round(ready.atMs - triggerAtMs));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lastReady = running.readyEvents[running.readyEvents.length - 1];
        errors.push(
          [
            message,
            `readyEvents=${running.readyEvents.length}; lastReadyVersion=${lastReady?.version ?? 'none'}; lastReadyPid=${lastReady?.pid ?? 'none'}`,
            `watchFile=${running.fixture.watchedFile}; exists=${fs.existsSync(running.fixture.watchedFile)}`,
            `childPid=${running.child.pid ?? 'none'}; exitCode=${running.child.exitCode ?? 'running'}; signal=${running.child.signalCode ?? 'none'}`,
            `stderrTail=${running.stderrTail || '(captured in timeout message if available)'}`
          ].join('\n')
        );
        break;
      }

      await delay(WATCH_SETTLE_MS);
    }

    return {
      noChangeWindowMs: NO_CHANGE_WINDOW_MS,
      unexpectedRestarts,
      attempted: RESTARTS_PER_RUN,
      succeeded: latencyMs.length,
      failed: RESTARTS_PER_RUN - latencyMs.length,
      latencyMs,
      errors
    };
  } finally {
    await forceCleanup(running);
  }
}

// -----------------------------------------------------------------------------
// Paired, alternating execution order
// -----------------------------------------------------------------------------

async function runPaired<T>(
  label: string,
  tools: Record<ToolName, ToolConfig>,
  runCount: number,
  benchmark: (tool: ToolConfig, runIndex: number) => Promise<T>
): Promise<ToolRuns<T>> {
  const results: ToolRuns<T> = {
    nodeloop: [],
    nodemon: [],
    errors: { nodeloop: [], nodemon: [] }
  };

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    const order: ToolName[] =
      runIndex % 2 === 0 ? ['nodeloop', 'nodemon'] : ['nodemon', 'nodeloop'];

    for (const toolName of order) {
      console.error(`  ${label}: ${toolName} run ${runIndex + 1}/${runCount}`);

      try {
        const result = await benchmark(tools[toolName], runIndex);
        results[toolName].push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.errors[toolName].push(`run ${runIndex + 1}: ${message}`);
        console.error(`    ERROR: ${message}`);
      }
    }
  }

  return results;
}

// -----------------------------------------------------------------------------
// Result aggregation and comparison
// -----------------------------------------------------------------------------

function summarizeResources(runs: StartupRun[]): Record<string, NumericStats | null> {
  return {
    idleRssKb: aggregateOptional(runs.map((run) => run.resources.idleRssKb)),
    averageRssKb: aggregateOptional(runs.map((run) => run.resources.averageRssKb)),
    peakRssKb: aggregateOptional(runs.map((run) => run.resources.peakRssKb)),
    peakPssKb: aggregateOptional(runs.map((run) => run.resources.peakPssKb)),
    peakUssKb: aggregateOptional(runs.map((run) => run.resources.peakUssKb)),
    peakSwapKb: aggregateOptional(runs.map((run) => run.resources.peakSwapKb)),
    averageCpuPct: aggregateOptional(runs.map((run) => run.resources.averageCpuPct)),
    peakCpuPct: aggregateOptional(runs.map((run) => run.resources.peakCpuPct)),
    idleAverageCpuPct: aggregateOptional(runs.map((run) => run.resources.idleAverageCpuPct)),
    cpuTimeMs: aggregateOptional(runs.map((run) => run.resources.cpuTimeMs)),
    startupCpuMs: aggregateOptional(runs.map((run) => run.startupCpuMs)),
    peakProcessCount: aggregateOptional(runs.map((run) => run.resources.peakProcessCount)),
    peakThreadCount: aggregateOptional(runs.map((run) => run.resources.peakThreadCount)),
    voluntaryContextSwitches: aggregateOptional(
      runs.map((run) => run.resources.voluntaryContextSwitches)
    ),
    involuntaryContextSwitches: aggregateOptional(
      runs.map((run) => run.resources.involuntaryContextSwitches)
    )
  };
}

function summarizeFileRuns(runs: FileStartupRun[]) {
  return {
    startupMs: calculateStats(runs.map((run) => run.startupMs)),
    peakRssKb: aggregateOptional(runs.map((run) => run.peakRssKb)),
    peakCpuPct: aggregateOptional(runs.map((run) => run.peakCpuPct)),
    peakProcessCount: aggregateOptional(runs.map((run) => run.peakProcessCount))
  };
}

function summarizeShutdownRuns(runs: ShutdownRun[]) {
  const measuredShutdowns = runs
    .map((run) => run.shutdownMs)
    .filter((value): value is number => value !== null);

  return {
    gracefulShutdownMs: calculateStats(measuredShutdowns),
    successfulGracefulShutdowns: runs.filter((run) => run.graceful).length,
    forcedCleanupCount: runs.filter((run) => run.forcedCleanup).length,
    processesRemainingBeforeForceSamples: aggregateOptional(
      runs.map((run) => run.processesRemainingBeforeForce)
    ),
    errors: runs.map((run) => run.error).filter((value): value is string => Boolean(value))
  };
}

function summarizeRestartRuns(runs: RestartRun[]) {
  const latencies = runs.flatMap((run) => run.latencyMs);
  const attempted = runs.reduce((total, run) => total + run.attempted, 0);
  const succeeded = runs.reduce((total, run) => total + run.succeeded, 0);
  const failed = runs.reduce((total, run) => total + run.failed, 0);

  return {
    restartLatencyMs: calculateStats(latencies),
    noChangeWindowMs: runs[0]?.noChangeWindowMs ?? NO_CHANGE_WINDOW_MS,
    unexpectedRestarts: runs.reduce((total, run) => total + run.unexpectedRestarts, 0),
    runsWithUnexpectedRestarts: runs.filter((run) => run.unexpectedRestarts > 0).length,
    attempted,
    succeeded,
    failed,
    successRatePct: attempted > 0 ? round((succeeded / attempted) * 100) : null,
    errors: runs.flatMap((run) => run.errors)
  };
}

function toolSummary(
  startupRuns: StartupRun[],
  fileRuns: Map<number, FileStartupRun[]>,
  shutdownRuns: ShutdownRun[],
  restartRuns: RestartRun[]
) {
  const firstResourceRun = startupRuns.find((run) => run.resources.supported);

  const startup = {
    appReadyMs: calculateStats(startupRuns.map((run) => run.startupMs)),
    resources: summarizeResources(startupRuns),
    sampler: firstResourceRun
      ? {
          supported: true,
          method: firstResourceRun.resources.method,
          sampleIntervalMs: firstResourceRun.resources.sampleIntervalMs
        }
      : {
          supported: false,
          method: 'unavailable',
          sampleIntervalMs: SAMPLE_INTERVAL_MS
        }
  };

  const startupWithFiles: Record<string, ReturnType<typeof summarizeFileRuns>> = {};
  for (const [fileCount, runs] of fileRuns) {
    startupWithFiles[String(fileCount)] = summarizeFileRuns(runs);
  }

  return {
    startup,
    startupWithFiles,
    shutdown: summarizeShutdownRuns(shutdownRuns),
    fileWatching: summarizeRestartRuns(restartRuns),
    sampleCounts: {
      startup: startupRuns.length,
      shutdown: shutdownRuns.length,
      restart: restartRuns.length
    }
  };
}

function makeComparisons(
  nodeloop: ReturnType<typeof toolSummary>,
  nodemon: ReturnType<typeof toolSummary>
) {
  const comparisons: Record<string, unknown> = {
    appReadyMs: ratio(
      nodeloop.startup.appReadyMs?.median ?? null,
      nodemon.startup.appReadyMs?.median ?? null
    ),
    idleRssKb: ratio(
      nodeloop.startup.resources.idleRssKb?.median ?? null,
      nodemon.startup.resources.idleRssKb?.median ?? null
    ),
    peakRssKb: ratio(
      nodeloop.startup.resources.peakRssKb?.median ?? null,
      nodemon.startup.resources.peakRssKb?.median ?? null
    ),
    averageCpuPct: ratio(
      nodeloop.startup.resources.averageCpuPct?.median ?? null,
      nodemon.startup.resources.averageCpuPct?.median ?? null
    ),
    idleAverageCpuPct: ratio(
      nodeloop.startup.resources.idleAverageCpuPct?.median ?? null,
      nodemon.startup.resources.idleAverageCpuPct?.median ?? null
    ),
    gracefulShutdownMs: ratio(
      nodeloop.shutdown.gracefulShutdownMs?.median ?? null,
      nodemon.shutdown.gracefulShutdownMs?.median ?? null
    ),
    restartLatencyMs: ratio(
      nodeloop.fileWatching.restartLatencyMs?.median ?? null,
      nodemon.fileWatching.restartLatencyMs?.median ?? null
    ),
    startupWithFiles: {}
  };

  const fileComparisons = comparisons.startupWithFiles as Record<string, unknown>;
  for (const fileCount of FILE_COUNTS) {
    fileComparisons[String(fileCount)] = ratio(
      nodeloop.startupWithFiles[String(fileCount)]?.startupMs?.median ?? null,
      nodemon.startupWithFiles[String(fileCount)]?.startupMs?.median ?? null
    );
  }

  return comparisons;
}

// -----------------------------------------------------------------------------
// Environment and report output
// -----------------------------------------------------------------------------

function readCgroupLimits() {
  if (process.platform !== 'linux') return null;

  const readText = (filePath: string): string | null => {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch {
      return null;
    }
  };

  let cpuQuotaCores: number | null = null;
  let memoryLimitBytes: number | null = null;
  let memoryCurrentBytes: number | null = null;

  const cpuV2 = readText('/sys/fs/cgroup/cpu.max');
  if (cpuV2) {
    const [quotaText, periodText] = cpuV2.split(/\s+/);
    const quota = Number(quotaText);
    const period = Number(periodText);
    if (quotaText !== 'max' && quota > 0 && period > 0) {
      cpuQuotaCores = round(quota / period, 2);
    }
  } else {
    const quota = Number(readText('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
    const period = Number(readText('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
    if (quota > 0 && period > 0) cpuQuotaCores = round(quota / period, 2);
  }

  const memoryMaxV2 = readText('/sys/fs/cgroup/memory.max');
  const memoryCurrentV2 = readText('/sys/fs/cgroup/memory.current');
  if (memoryMaxV2 && memoryMaxV2 !== 'max') memoryLimitBytes = Number(memoryMaxV2);
  if (memoryCurrentV2) memoryCurrentBytes = Number(memoryCurrentV2);

  if (memoryLimitBytes === null) {
    const v1Limit = Number(readText('/sys/fs/cgroup/memory/memory.limit_in_bytes'));
    const v1Current = Number(readText('/sys/fs/cgroup/memory/memory.usage_in_bytes'));
    if (Number.isFinite(v1Limit) && v1Limit > 0 && v1Limit < Number.MAX_SAFE_INTEGER) {
      memoryLimitBytes = v1Limit;
    }
    if (Number.isFinite(v1Current) && v1Current >= 0) memoryCurrentBytes = v1Current;
  }

  return {
    cpuQuotaCores,
    memoryLimitGb:
      memoryLimitBytes !== null && Number.isFinite(memoryLimitBytes)
        ? round(memoryLimitBytes / 1024 ** 3, 2)
        : null,
    memoryCurrentGb:
      memoryCurrentBytes !== null && Number.isFinite(memoryCurrentBytes)
        ? round(memoryCurrentBytes / 1024 ** 3, 2)
        : null
  };
}

function environmentInfo() {
  const cpus = os.cpus();
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const loadAverage = os.loadavg();

  return {
    node: process.version,
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    architecture: os.arch(),
    logicalCpuCount: cpus.length,
    availableCpuParallelism: os.availableParallelism(),
    cgroupLimits: readCgroupLimits(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMemoryGb: round(totalMemoryBytes / 1024 ** 3, 2),
    freeMemoryAtStartGb: round(freeMemoryBytes / 1024 ** 3, 2),
    loadAverageAtStart: loadAverage.map((value) => round(value, 2)),
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    benchmarkRuns: RUNS,
    restartAttemptsPerRun: RESTARTS_PER_RUN,
    fileCounts: FILE_COUNTS,
    watcherDelayMs: DELAY_MS,
    idleWindowMs: IDLE_WINDOW_MS,
    watchSettleMs: WATCH_SETTLE_MS,
    noChangeWindowMs: NO_CHANGE_WINDOW_MS,
    timeoutMs: TIMEOUT_MS,
    watchTimeoutMs: WATCH_TIMEOUT_MS,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS
  };
}

function printStatsRow(
  label: string,
  nodeloop: NumericStats | null,
  nodemon: NumericStats | null,
  unit: string
): void {
  const left = nodeloop ? `${nodeloop.median} ${unit}` : 'N/A';
  const right = nodemon ? `${nodemon.median} ${unit}` : 'N/A';
  const comparison =
    nodeloop && nodemon
      ? (ratio(nodeloop.median, nodemon.median).nodeloopToNodemon?.toFixed(3) ?? 'N/A')
      : 'N/A';
  console.error(
    `| ${label.padEnd(29)} | ${left.padEnd(15)} | ${right.padEnd(15)} | ${comparison.padEnd(10)} |`
  );
}

function printSummary(
  nodeloop: ReturnType<typeof toolSummary>,
  nodemon: ReturnType<typeof toolSummary>
): void {
  console.error('\n=== BENCHMARK SUMMARY (median values) ===');
  console.error(
    '| Metric                        | nodeloop        | nodemon         | NL/ND ratio |'
  );
  console.error(
    '|-------------------------------|-----------------|-----------------|-------------|'
  );
  printStatsRow(
    'App ready / startup',
    nodeloop.startup.appReadyMs,
    nodemon.startup.appReadyMs,
    'ms'
  );
  printStatsRow(
    'Idle RSS',
    nodeloop.startup.resources.idleRssKb,
    nodemon.startup.resources.idleRssKb,
    'KiB'
  );
  printStatsRow(
    'Peak RSS',
    nodeloop.startup.resources.peakRssKb,
    nodemon.startup.resources.peakRssKb,
    'KiB'
  );
  printStatsRow(
    'Peak PSS',
    nodeloop.startup.resources.peakPssKb,
    nodemon.startup.resources.peakPssKb,
    'KiB'
  );
  printStatsRow(
    'Peak USS',
    nodeloop.startup.resources.peakUssKb,
    nodemon.startup.resources.peakUssKb,
    'KiB'
  );
  printStatsRow(
    'Average CPU (one core)',
    nodeloop.startup.resources.averageCpuPct,
    nodemon.startup.resources.averageCpuPct,
    '%'
  );
  printStatsRow(
    'Peak sampled CPU',
    nodeloop.startup.resources.peakCpuPct,
    nodemon.startup.resources.peakCpuPct,
    '%'
  );
  printStatsRow(
    'Idle CPU (one core)',
    nodeloop.startup.resources.idleAverageCpuPct,
    nodemon.startup.resources.idleAverageCpuPct,
    '%'
  );
  printStatsRow(
    'Process-tree CPU time',
    nodeloop.startup.resources.cpuTimeMs,
    nodemon.startup.resources.cpuTimeMs,
    'ms'
  );
  printStatsRow(
    'Peak process count',
    nodeloop.startup.resources.peakProcessCount,
    nodemon.startup.resources.peakProcessCount,
    'processes'
  );
  printStatsRow(
    'Peak thread count',
    nodeloop.startup.resources.peakThreadCount,
    nodemon.startup.resources.peakThreadCount,
    'threads'
  );
  printStatsRow(
    'Peak swap',
    nodeloop.startup.resources.peakSwapKb,
    nodemon.startup.resources.peakSwapKb,
    'KiB'
  );
  printStatsRow(
    'Graceful shutdown',
    nodeloop.shutdown.gracefulShutdownMs,
    nodemon.shutdown.gracefulShutdownMs,
    'ms'
  );
  const restartCell = (summary: ReturnType<typeof toolSummary>) =>
    summary.fileWatching.restartLatencyMs
      ? `${summary.fileWatching.restartLatencyMs.median} ms`
      : `FAILED ${summary.fileWatching.succeeded}/${summary.fileWatching.attempted}`;
  const restartRatio =
    nodeloop.fileWatching.restartLatencyMs && nodemon.fileWatching.restartLatencyMs
      ? (ratio(
          nodeloop.fileWatching.restartLatencyMs.median,
          nodemon.fileWatching.restartLatencyMs.median
        ).nodeloopToNodemon?.toFixed(3) ?? 'N/A')
      : 'N/A';
  console.error(
    `| ${'Restart after file change'.padEnd(29)} | ${restartCell(nodeloop).padEnd(15)} | ${restartCell(nodemon).padEnd(15)} | ${restartRatio.padEnd(10)} |`
  );

  for (const fileCount of FILE_COUNTS) {
    printStatsRow(
      `Startup with ${fileCount} files`,
      nodeloop.startupWithFiles[String(fileCount)]?.startupMs ?? null,
      nodemon.startupWithFiles[String(fileCount)]?.startupMs ?? null,
      'ms'
    );
  }

  console.error(
    '\nCPU is expressed as a percentage of one logical core; values can exceed 100% when multiple processes run concurrently.'
  );
  console.error(
    'Memory values are KiB. A measured 0 KiB swap is valid (no swap used); unsupported metrics are N/A. PSS/USS are available on Linux.'
  );
  console.error(
    'Restart test also reports unexpected restarts during a no-change observation window.'
  );
  console.error(
    `No-change unexpected restarts: nodeloop=${nodeloop.fileWatching.unexpectedRestarts}, nodemon=${nodemon.fileWatching.unexpectedRestarts}`
  );
  console.error(
    `Restart success rate: nodeloop=${nodeloop.fileWatching.successRatePct ?? 'N/A'}%, nodemon=${nodemon.fileWatching.successRatePct ?? 'N/A'}%`
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const tools = resolveTools();
  const environment = environmentInfo();

  console.error('Nodeloop vs Nodemon — comprehensive benchmark');
  console.error(
    `Node: ${environment.node} | OS: ${environment.osType} ${environment.osRelease} ${environment.architecture}`
  );
  console.error(`CPU: ${environment.cpuModel} x${environment.logicalCpuCount}`);
  console.error(
    `RAM: ${environment.totalMemoryGb} GiB total, ${environment.freeMemoryAtStartGb} GiB free at start`
  );
  console.error(`Runs: ${RUNS} | Delay: ${DELAY_MS} ms | File counts: ${FILE_COUNTS.join(', ')}`);
  console.error(`Process sampler: ${process.platform} | interval: ${SAMPLE_INTERVAL_MS} ms\n`);

  console.error('[1/4] App startup, idle CPU and memory');
  const startupRuns = await runPaired('startup+idle', tools, RUNS, (tool) =>
    benchmarkStartupAndIdle(tool)
  );

  console.error('\n[2/4] Startup with existing files');
  const fileRunsByTool: Record<ToolName, Map<number, FileStartupRun[]>> = {
    nodeloop: new Map(),
    nodemon: new Map()
  };

  for (const fileCount of FILE_COUNTS) {
    const fileRuns = await runPaired(`${fileCount} files`, tools, RUNS, (tool) =>
      benchmarkStartupWithFiles(tool, fileCount)
    );
    fileRunsByTool.nodeloop.set(fileCount, fileRuns.nodeloop);
    fileRunsByTool.nodemon.set(fileCount, fileRuns.nodemon);
  }

  console.error('\n[3/4] Graceful shutdown and leftover-process detection');
  const shutdownRuns = await runPaired('shutdown', tools, RUNS, (tool) => benchmarkShutdown(tool));

  console.error('\n[4/4] File change detection and restart latency');
  const restartRuns = await runPaired('watch/restart', tools, RUNS, (tool) =>
    benchmarkRestartLatency(tool)
  );

  const nodeloop = toolSummary(
    startupRuns.nodeloop,
    fileRunsByTool.nodeloop,
    shutdownRuns.nodeloop,
    restartRuns.nodeloop
  );
  const nodemon = toolSummary(
    startupRuns.nodemon,
    fileRunsByTool.nodemon,
    shutdownRuns.nodemon,
    restartRuns.nodemon
  );

  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    benchmark: {
      name: 'nodeloop-vs-nodemon',
      timingDefinition: 'spawn() call to unique READY marker printed by the target application',
      memoryDefinition:
        'aggregate memory of the benchmark tool process tree, not the benchmark runner',
      cpuDefinition:
        'aggregate process-tree CPU time divided by wall time; percentage of one logical core',
      fileWatchingDefinition:
        'elapsed time from writing watched.js to the next target application READY marker',
      watcherStabilityDefinition:
        'unexpected READY markers during a no-file-change observation window',
      fileCountDefinition:
        'configured file count means extra pre-existing fixture files; app.js and watched.js are additional control files',
      executionOrder:
        'paired sequential runs; tool order alternates every run to reduce order bias',
      caveats: [
        'This is a fresh process launch benchmark, not a claim of a cold OS filesystem cache.',
        'RSS can count shared pages more than once across processes; use PSS as a better shared-memory-adjusted view where available.',
        'CPU peak is sampled and may miss very short spikes.',
        'Windows process sampling uses PowerShell/CIM and has a larger sampling interval.',
        'A watcher restart timeout means file-change detection was not observed in this environment; it is not silently treated as zero latency.'
      ]
    },
    environment,
    configuration: {
      nodeloopCli: tools.nodeloop.cliPath,
      nodemonCli: tools.nodemon.cliPath,
      nodeloopArgs: tools.nodeloop.getArgs({
        directory: '<fixture>',
        appFile: '<fixture>/app.js',
        watchedFile: '<fixture>/watched.js',
        runId: '<run-id>'
      }),
      nodemonArgs: tools.nodemon.getArgs({
        directory: '<fixture>',
        appFile: '<fixture>/app.js',
        watchedFile: '<fixture>/watched.js',
        runId: '<run-id>'
      })
    },
    results: { nodeloop, nodemon },
    comparisons: makeComparisons(nodeloop, nodemon),
    executionErrors: {
      nodeloop: {
        startup: startupRuns.errors.nodeloop,
        shutdown: shutdownRuns.errors.nodeloop,
        restart: restartRuns.errors.nodeloop
      },
      nodemon: {
        startup: startupRuns.errors.nodemon,
        shutdown: shutdownRuns.errors.nodemon,
        restart: restartRuns.errors.nodemon
      }
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`);

  printSummary(nodeloop, nodemon);
  console.error(`\nJSON report written to: ${OUTPUT_JSON}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  console.error('\nBenchmark failed:');
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
