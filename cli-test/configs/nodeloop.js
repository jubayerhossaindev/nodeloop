// nodeloop.js - JavaScript CommonJS config example
module.exports = {
  ext: 'js,mjs,cjs,json',
  ignore: ['node_modules', 'logs', 'uploads'],
  delay: 200,
  maxWait: 0,
  verbose: true,
  quiet: false,
  env: {
    TEST_VAR: 'hello-from-js'
  },
  killSignal: 'SIGINT',
  killTimeout: 5000,
  restartable: 'rs',
  colours: true,
  legacyWatch: false
};
