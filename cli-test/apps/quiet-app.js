// cli-test/apps/quiet-app.js - Test quiet mode (minimal output)
console.log('QUIET APP RUNNING - minimal banner output expected');
let i = 0;
setInterval(() => {
  process.stdout.write(`quiet tick ${i++}\n`);
}, 1000);
