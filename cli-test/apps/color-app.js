// cli-test/apps/color-app.js - Test color mode output
console.log('COLOR APP - ANSI color output test');
let i = 0;
setInterval(() => {
  console.log(`\x1b[32mCOLOR TICK ${i++}\x1b[0m - ${new Date().toISOString()}`);
}, 1000);
