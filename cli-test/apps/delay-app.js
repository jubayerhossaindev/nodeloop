// cli-test/apps/delay-app.js - Test delay/debounce configuration
console.log('DELAY APP - testing debounce delay configuration');
let i = 0;
setInterval(() => {
  console.log(`DELAY TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
