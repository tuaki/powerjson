import { DISPLAY_ERROR_STACKS } from './config.ts';

const seenErrors = new Set<string>();

export function printBenchmarkError(message: string, error: unknown, onlyUnique = false) {
    if (onlyUnique && seenErrors.has(message))
        return;

    seenErrors.add(message);

    if (DISPLAY_ERROR_STACKS)
        console.error(message, '\n', error);
    else
        console.error(message);
}

export function printWarning(message: string) {
    console.error(`warning: ${message}`);
}

/**
 * Forces a full GC cycle (if the runtime allows it) so the upcoming timed phase starts from a clean, comparable heap state.
 * Works under Bun out of the box; under Node, requires starting the process with `--expose-gc`.
 */
export function forceGc() {
    const bun = (globalThis as { Bun?: { gc: (force?: boolean) => void } }).Bun;
    if (bun) {
        bun.gc(true);
        return;
    }

    const nodeGc = (globalThis as { gc?: () => void }).gc;
    if (nodeGc) {
        nodeGc();
        return;
    }

    if (!warnedNoForceGc) {
        warnedNoForceGc = true;
        printWarning('Cannot force garbage collection on this runtime (Node needs to be started with \'--expose-gc\').');
    }
}

let warnedNoForceGc = false;

/** Deterministic PRNG (mulberry32), so shuffles are reproducible given the same seed. */
export function createSeededRNG(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Fisher-Yates shuffle, mutating `items` in place. */
export function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ items[i], items[j] ] = [ items[j], items[i] ];
    }

    return items;
}

/** Hashes a string into a 32-bit integer, for deriving per-scenario/per-batch PRNG seeds. */
export function hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

export function median(values: number[]): number {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0)
        return NaN;

    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Relative spread of the values around their median, robust to outliers (e.g., stray GC pauses).
 * Based on the median absolute deviation, scaled to be comparable to a relative standard deviation for normally distributed data.
 * @returns NaN when it cannot be estimated (fewer than 2 finite samples, or a median of 0 which makes "relative" undefined).
 */
export function relativeSpread(values: number[]): number {
    const finite = values.filter(Number.isFinite);
    if (finite.length < 2)
        return NaN;

    const center = median(finite);
    if (center === 0)
        return NaN;

    const deviations = finite.map(value => Math.abs(value - center));
    return (median(deviations) * 1.4826) / Math.abs(center);
}

export type Stat = {
    value: number;
    /** Absolute error estimate (median-absolute-deviation based spread across batches), NaN when it could not be estimated (e.g. a single batch). */
    error: number;
};

/** Combines repeated measurements of the same thing (e.g. one value per batch) into a robust value + error estimate. */
export function statFromSamples(values: number[]): Stat {
    const value = median(values);
    return {
        value,
        error: relativeSpread(values) * Math.abs(value),
    };
}

/** Combines two independent Stats (e.g. `serializeMs + toJsonMs`), propagating their errors. */
export function addStats(a: Stat, b: Stat): Stat {
    return {
        value: a.value + b.value,
        error: Math.hypot(a.error, b.error),
    };
}

export type InputValue = unknown;

type SimpleSerializer = {
    name: string;
    stringify(value: InputValue): string;
    parse(json: string): InputValue;
};

type ComplexSerializer<TSerialized> = SimpleSerializer & {
    serialize(value: InputValue): TSerialized;
    deserialize(serialized: TSerialized): InputValue;
    toJson(serialized: TSerialized): string;
    fromJson(json: string): TSerialized;
};

export type Serializer<TSerializer = unknown> = SimpleSerializer | ComplexSerializer<TSerializer>;

export function createSerializer<TSerializer = unknown>(
    name: string,
    serializer: Omit<SimpleSerializer, 'name'> | Omit<ComplexSerializer<TSerializer>, 'name'>,
): Serializer<TSerializer> {
    return {
        name,
        ...serializer,
    };
}

export type Scenario = {
    id: string;
    name: string;
    description: string;
    skipSerializers?: string[];
    /** Number of iterations to generate for each batch. All batches will have the exact same data. */
    iterations: number;
    /**
     * Number of batches to run.
     * The rationale for batches is that too many iterations might easily not fit in memory.
     */
    batches?: number;
    /** If array is returned, it will be serialized by items (we measure the total time). */
    getData(): InputValue | InputValue[];
};

export type UnitType = 'time' | 'size';

export type Unit = {
    type: UnitType;
    label: string;
    divisor: number;
    format: (value: number) => string;
};

export function selectUnit(unitType: UnitType, values: number[]): Unit {
    switch (unitType) {
        case 'time':
            return selectCommonUnit(values, timeUnits);
        case 'size':
            return selectCommonUnit(values, sizeUnits);
    }
}

const timeUnits: Unit[] = [
    { label: 'ms', divisor: 1 },
    { label: 's', divisor: 1_000 },
].map(unit => ({
    ...unit,
    type: 'time',
    format: (value: number) => formatNumber(value, unit.divisor),
}));

const sizeUnits: Unit[] = [
    { label: 'B', divisor: 1 },
    { label: 'KB', divisor: 1024 },
    { label: 'MB', divisor: 1024 ** 2 },
    { label: 'GB', divisor: 1024 ** 3 },
].map(unit => ({
    ...unit,
    type: 'size',
    format: (value: number) => formatNumber(value, unit.divisor),
}));

function selectCommonUnit(values: number[], units: Unit[]): Unit {
    const largestValue = Math.max(...values.filter(Number.isFinite), 0);

    let selectedUnit = units[0]!;
    for (const unit of units) {
        if (largestValue >= unit.divisor)
            selectedUnit = unit;
    }

    return selectedUnit;
}

function formatNumber(value: number, divisor: number): string {
    if (!Number.isFinite(value))
        return 'NaN';

    return (value / divisor).toFixed(3);
}
