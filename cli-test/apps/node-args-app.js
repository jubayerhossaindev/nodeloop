// cli-test/apps/node-args-app.js - Test --node-args flag
console.log('NODE ARGS APP - testing node arguments');
let i = 0;
setInterval(() => {
  console.log(`NODE ARGS TICK ${i++} - ${new Date().toISOString()}`);
}, 1000);
