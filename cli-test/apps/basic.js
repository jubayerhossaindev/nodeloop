// cli-test/apps/basic.js - Simple auto-restart test app
let i = 0;
setInterval(() => {
  console.log(`TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
console.log('APP STARTED');
