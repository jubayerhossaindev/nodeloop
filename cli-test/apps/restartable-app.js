// cli-test/apps/restartable-app.js - Test manual restart via 'rs' command
console.log("RESTARTABLE APP - type 'rs' in TTY to manually restart");
let i = 0;
setInterval(() => {
  console.log(`RESTARTABLE TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
