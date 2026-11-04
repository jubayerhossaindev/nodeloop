// cli-test/apps/error-app.js - Test error handling scenarios
console.log('ERROR APP - testing various error scenarios');

// Test 1: Throw after 3 seconds
setTimeout(() => {
  console.log('THROWING INTENTIONAL ERROR...');
  throw new Error('INTENTIONAL ERROR FOR TESTING');
}, 3000);

// Test 2: Unhandled rejection after 5 seconds
setTimeout(() => {
  Promise.reject(new Error('UNHANDLED REJECTION TEST'));
}, 5000);

let i = 0;
setInterval(() => {
  console.log(`ERROR TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
