/**
Native errors — predictable failures for missing, invalid or incompatible
native binaries (spec §9). Nothing here is vague: each error names WHAT
was wrong and WHAT to do about it.
*/
import { NodeloopError } from '../errors/types.js';

/**
No usable binary could be located for this platform/arch.
*/
export class NativeLoadError extends NodeloopError {
  constructor(detail: string) {
    super(
      `native watcher unavailable: ${detail}`,
      'build it with: npm run build:native (cargo build --release -p nodeloop-native)'
    );
  }
}

/**
A binary was found but does not honor the NativeModule contract.
*/
export class NativeContractError extends NodeloopError {
  constructor(detail: string) {
    super(
      `native watcher incompatible: ${detail}`,
      'rebuild the native addon: npm run build:native'
    );
  }
}

/**
The bridge reported an error for an operation (bad id, dead watcher…).
*/
export class NativeOperationError extends NodeloopError {
  constructor(operation: string, detail: string) {
    super(`native ${operation} failed: ${detail}`);
  }
}
