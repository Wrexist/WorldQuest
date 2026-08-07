/// <reference path="./react-native-web.d.ts" />
//
// The reference is load-bearing, not decoration. `react-native-web.d.ts` augments
// React Native's `TextProps`, and an augmentation only applies to a project that
// actually loads the file. Without this line the design package compiles (its own
// tsconfig globs the file) and `apps/mobile` does not, because it consumes this
// package through its entry point and never sees a stray .d.ts beside it.

export * from './tokens.js'
export * from './typography.js'
export * from './motion.js'
export * from './primitives/index.js'
export * from './tally.js'
