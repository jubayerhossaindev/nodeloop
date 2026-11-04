// nodeloop.ts - TypeScript config example
export default {
  ext: 'js,mjs,cjs,json',
  ignore: ['node_modules', 'logs', 'uploads'],
  delay: 200,
  maxWait: 0,
  verbose: true,
  quiet: false,
  env: {
    TEST_VAR: 'hello-from-ts'
  },
  killSignal: 'SIGINT',
  killTimeout: 5000,
  restartable: 'rs',
  colours: true,
  legacyWatch: false
};
