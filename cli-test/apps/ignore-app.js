// cli-test/apps/ignore-app.js - Test --ignore flag
console.log('IGNORE APP - testing ignore directory configuration');
let i = 0;
setInterval(() => {
  console.log(`IGNORE TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
