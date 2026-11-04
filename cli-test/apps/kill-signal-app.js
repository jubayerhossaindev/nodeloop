// cli-test/apps/kill-signal-app.js - Test kill signal handling
let shuttingDown = false;

process.on('SIGINT', () => {
  if (!shuttingDown) {
    shuttingDown = true;
    console.log('RECEIVED SIGINT - shutting down gracefully...');
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  console.log('RECEIVED SIGTERM - shutting down...');
  process.exit(0);
});

console.log('KILL SIGNAL APP - send SIGINT/SIGTERM to test signal handling');
let i = 0;
setInterval(() => {
  console.log(`SIGNAL TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
