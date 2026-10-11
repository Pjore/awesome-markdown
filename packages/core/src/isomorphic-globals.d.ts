// Minimal globals available in both Node (>= 17) and modern browsers. Core
// deliberately compiles without `@types/node` and the DOM lib so that any
// Node-only or browser-only API fails to typecheck here.
declare function structuredClone<T>(value: T): T;
declare const console: { warn(...args: unknown[]): void };
