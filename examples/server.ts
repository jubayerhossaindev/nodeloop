/**
 * server.ts — demo app targeted by the example nodeloop config file
 * (`examples/nodeloop.ts`). Prints its runtime facts so you can SEE the
 * config taking effect (env from config.env, args from config.scriptArgs),
 * then idles until nodeloop restarts or stops it.
 */

const facts = {
  pid: process.pid,
  argv: process.argv.slice(2),
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DEBUG: process.env.DEBUG
};

console.log(`[app] ready — pid=${facts.pid} argv=${JSON.stringify(facts.argv)}`);
console.log(`[app] env — NODE_ENV=${facts.NODE_ENV} PORT=${facts.PORT} DEBUG=${facts.DEBUG}`);

setInterval(() => {}, 1 << 30); // stay alive; Ctrl+C or nodeloop stops us
