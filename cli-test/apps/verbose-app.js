// cli-test/apps/verbose-app.js - Test verbose mode output
console.log('VERBOSE APP STARTED');
console.log('Watching for changes...');
let i = 0;
setInterval(() => {
  console.log(`VERBOSE TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
