/**
 * nodeloop.ts — FULL reference config: every supported key.
 *
 * This file is EXECUTED by nodeloop (like vite.config.ts and friends) —
 * it can compute values, read process.env, and import other modules.
 */
export default {
  // script to run — same as the first CLI argument
  script: 'server.ts',

  // args AFTER the script — passed to your app verbatim
  scriptArgs: ['--port', 3000],

  // extensions that trigger a restart (default: js, mjs, cjs, json)
  ext: ['ts', 'tsx', 'js', 'mjs', 'cjs', 'json'],

  // directory names to skip — CLI `--ignore` EXTENDS this list
  ignore: ['node_modules', 'dist', 'uploads', 'logs'],

  // only restart for changes under these paths (default: whole cwd)
  watch: ['examples'],

  // ms debounce after a change before restarting (default: 200)
  delay: 250,

  // force a restart after this many ms of endless change bursts (0 = off)
  maxWait: 5000,

  // show detail on what is causing restarts
  verbose: true,

  // your app output only — all nodeloop banners off
  quiet: false,

  // signal used to stop the child on restart (default: SIGTERM)
  killSignal: 'SIGTERM',

  // ms to wait before escalating to SIGKILL (default: 3000)
  killTimeout: 2000,

  // extra env for the child — values are stringified: 3000 -> "3000"
  env: { NODE_ENV: 'development', PORT: 3000, DEBUG: true },

  // executable that runs the script (default: node)
  exec: 'node', // or 'tsx', 'deno run -A', 'npm run dev', ...

  // extra args for node itself
  nodeArgs: ['--enable-source-maps'] // ie. ['--inspect', '--trace-warnings']
};
