/**
Platform detection used by the spawn resolver and the process-tree killer.
The platform is injectable everywhere it is consumed so the Windows
behavior (cmd.exe shims, taskkill) stays unit-testable on every OS —
the same seam the legacy `resolveSpawn(exec, nodeArgs, script, args, opts)`
kept with its `opts.platform`.
*/
export type Platform = string;

export function currentPlatform(): Platform {
  return process.platform;
}

export function isWindows(platform: Platform = currentPlatform()): boolean {
  return platform === 'win32';
}
