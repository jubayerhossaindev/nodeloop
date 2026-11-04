// cli-test/apps/legacy-watch-app.js - Test legacy watch mode (polling)
console.log('LEGACY WATCH APP - polling every 1 second');
let i = 0;
setInterval(() => {
  console.log(`LEGACY TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
