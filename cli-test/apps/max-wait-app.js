// cli-test/apps/max-wait-app.js - Test max-wait configuration
console.log('MAX WAIT APP - testing max-wait configuration');
let i = 0;
setInterval(() => {
  console.log(`MAX WAIT TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
