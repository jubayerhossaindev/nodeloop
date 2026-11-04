// cli-test/apps/watch-path-app.js - Test --watch flag (custom watch path)
console.log('WATCH PATH APP - testing custom watch path');
let i = 0;
setInterval(() => {
  console.log(`WATCH PATH TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
