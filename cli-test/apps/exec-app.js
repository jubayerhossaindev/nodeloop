// cli-test/apps/exec-app.js - Test --exec flag (custom node command)
console.log('EXEC APP - testing custom exec command');
let i = 0;
setInterval(() => {
  console.log(`EXEC TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
