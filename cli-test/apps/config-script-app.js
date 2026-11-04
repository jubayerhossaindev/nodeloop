// cli-test/apps/config-script-app.js - Test config script key resolution
console.log('CONFIG SCRIPT APP - loaded via config script key');
console.log('This app was resolved from config.script, not CLI argument');
let i = 0;
setInterval(() => {
  console.log(`CONFIG SCRIPT TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
