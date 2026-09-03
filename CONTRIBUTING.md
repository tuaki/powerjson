# Contributing to PowerJson

## Prerequisites

Get [Bun](https://bun.sh/) 1.3 or later and run:

```sh
bun install
```

## Scripts

Run the complete TypeScript check:

```sh
bun run types
```

Run the test suite:

```sh
bun run test
```

Run ESLint with automatic fixes:

```sh
bun run lint
```

## Benchmarks

Run the benchmark scenarios with:

```sh
bun run benchmark
```

Benchmark inputs are deterministic through the seed and reference date in `benchmarks/config.ts`. Change `BENCHMARK_ITERATIONS_SCALE` there to increase the sample size when investigating performance; use values of at least `1` for meaningful comparisons. Avoid treating an individual benchmark run as conclusive because runtime noise can affect results.

## Building and packaging

Build the publishable ESM JavaScript, declarations, and source maps:

```sh
bun run build
```

Inspect the exact files that npm would publish:

```sh
bun pm pack --dry-run
```

Publish the package to npm:

```sh
npm login
bun publish
```

## Bugs

If you find a bug, please open an issue with a minimal reproduction.

### Pull requests

Keep changes scoped, add or update tests for behavior changes, and update the README or `docs/` when the public API or serialized format changes. Include the commands you ran and benchmark evidence for performance-related changes.
