// cli-test/apps/crash-app.js - Test crash recovery
console.log('CRASHING IN 2 SECONDS...');
setTimeout(() => {
  throw new Error('INTENTIONAL CRASH FOR TESTING');
}, 2000);
