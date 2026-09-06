export const DISPLAY_ERROR_STACKS = false;
export const DISPLAY_VERBOSE_RESULTS = true;

export const BENCHMARK_SEED = 80085;
export const REFERENCE_DATE = new Date('2025-01-01T12:00:00.000Z');
/**
 * Use this to scale the number of iterations for each benchmark.
 * Warning: values below 1 are not guarranteed to produce reliable results. (But neither are values above 1, haha.)
 */
export const BENCHMARK_ITERATIONS_SCALE = 1;

export const WARMUP_ITERATIONS_RATIO = 0.1;

/** If a serializer's median result varies by more than this fraction across a scenario's batches, a warning is printed. */
export const RELATIVE_SPREAD_WARNING_THRESHOLD = 0.1;

/** In result tables, values within this fraction of a column's/group's best are still highlighted as "close to best". */
export const RELATIVE_CLOSE_TO_BEST_THRESHOLD = 0.05;
