import { faker } from '@faker-js/faker';
import Table from 'cli-table3';
import { BENCHMARK_ITERATIONS_SCALE, BENCHMARK_SEED, DISPLAY_VERBOSE_RESULTS, RELATIVE_SPREAD_WARNING_THRESHOLD, WARMUP_ITERATIONS_RATIO } from './config.ts';
import { findBestStat, formatBestStat, renderRelativeCell } from './format.ts';
import { addStats, createSeededRNG, forceGc, hashString, printBenchmarkError, printWarning, relativeSpread, selectUnit, shuffleInPlace, statFromSamples, type InputValue, type Scenario, type Serializer, type Stat, type Unit } from './utils.ts';

export function runScenarios(scenarios: Scenario[], serializers: Serializer[]): ScenarioResult[] {
    console.log(`Running ${scenarios.length} benchmark scenarios on ${serializers.length} serializers...`);

    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
        if (DISPLAY_VERBOSE_RESULTS) {
            console.log('');
            console.log(`Scenario: ${scenario.name}`);
            console.log(scenario.description);
        }

        const result = runScenario(scenario, serializers);
        results.push(result);
        if (DISPLAY_VERBOSE_RESULTS)
            printScenarioResults(result, serializers);
    }

    return results;
}

export type ScenarioResult = {
    scenario: Scenario;
    results: SerializerResult[];
};

function runScenario(scenario: Scenario, serializers: Serializer[]): ScenarioResult {
    const batches = scenario.batches ?? 1;

    const runningResultsBySerializer: Map<string, SerializerBatchResult[]> = new Map();

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const batchResult = runScenarioBatch(scenario, serializers, batchIndex);

        for (const serializerResult of batchResult) {
            const serializerName = serializerResult.serializer;
            if (!runningResultsBySerializer.has(serializerName))
                runningResultsBySerializer.set(serializerName, []);

            runningResultsBySerializer.get(serializerName)!.push(serializerResult);
        }
    }

    const results: SerializerResult[] = [];

    for (const serializer of serializers) {
        if (scenario.skipSerializers?.includes(serializer.name))
            continue;

        const serializerResults = runningResultsBySerializer.get(serializer.name);
        if (!serializerResults)
            throw new Error(`No results found for serializer '${serializer.name}' in scenario '${scenario.name}'.`);

        // The median (rather than the mean) is used because it is far less sensitive to stray outliers, e.g. a GC pause or a scheduler hiccup on one batch.
        // The error is the spread of the per-batch values around that median (0 when there's only one batch to measure from).
        const combinedResult: SerializerResult = {
            serializer: serializer.name,
            serializeMs: statByKey(serializerResults, 'serializeMs'),
            toJsonMs: statByKey(serializerResults, 'toJsonMs'),
            deserializeMs: statByKey(serializerResults, 'deserializeMs'),
            fromJsonMs: statByKey(serializerResults, 'fromJsonMs'),
            stringifyMs: statByKey(serializerResults, 'stringifyMs'),
            parseMs: statByKey(serializerResults, 'parseMs'),
            stringSizeBytes: statByKey(serializerResults, 'stringSizeBytes'),
        };

        results.push(combinedResult);

        if (batches > 1)
            warnIfUnreliable(scenario.name, serializer.name, serializerResults);
    }

    return {
        scenario,
        results,
    };
}

function statByKey<TKey extends string>(items: { [P in TKey]: number }[], key: TKey): Stat {
    return statFromSamples(items.map(item => item[key]));
}

function warnIfUnreliable(scenarioName: string, serializerName: string, serializerResults: SerializerBatchResult[]) {
    const stringifySpread = relativeSpread(serializerResults.map(result => result.stringifyMs));
    const parseSpread = relativeSpread(serializerResults.map(result => result.parseMs));
    const worstSpread = Math.max(stringifySpread, parseSpread);

    if (worstSpread > RELATIVE_SPREAD_WARNING_THRESHOLD)
        printWarning(`Unreliable measurement for '${serializerName}' in scenario '${scenarioName}': results across batches vary by ~${(worstSpread * 100).toFixed(0)}%.`);
}

function runScenarioBatch(scenario: Scenario, serializers: Serializer[], batchIndex: number): SerializerBatchResult[] {
    const measureIterations = Math.max(1, Math.floor(scenario.iterations * BENCHMARK_ITERATIONS_SCALE));
    const warmupIterations = Math.max(1, Math.floor(measureIterations * WARMUP_ITERATIONS_RATIO));

    faker.seed(BENCHMARK_SEED);
    const items = Array.from({ length: measureIterations + warmupIterations }, () => scenario.getData());

    // Serializers are shuffled per batch (deterministically) so that any drift over the course of the run (thermal throttling, background load, ...) is spread evenly across all serializers instead of consistently favoring/penalizing the same ones.
    const shuffledSerializers = shuffleInPlace([ ...serializers ], createSeededRNG(hashString(scenario.id) ^ batchIndex));

    const results: SerializerBatchResult[] = [];

    for (const serializer of shuffledSerializers) {
        if (scenario.skipSerializers?.includes(serializer.name))
            continue;

        const serializerResult = measureSerializer(scenario.name, serializer, items, warmupIterations);
        results.push(serializerResult);
    }

    return results;
}

/** A single serializer's raw measurement from one batch. */
export type SerializerBatchResult = {
    serializer: string;
    serializeMs: number;
    toJsonMs: number;
    deserializeMs: number;
    fromJsonMs: number;
    stringifyMs: number;
    parseMs: number;
    stringSizeBytes: number;
};

/** A single serializer's result for a scenario, combined (with an error estimate) across all of the scenario's batches. */
export type SerializerResult = {
    serializer: string;
    serializeMs: Stat;
    toJsonMs: Stat;
    deserializeMs: Stat;
    fromJsonMs: Stat;
    stringifyMs: Stat;
    parseMs: Stat;
    stringSizeBytes: Stat;
};

function measureSerializer(scenarioName: string, serializer: Serializer, items: InputValue[] | InputValue[][], warmupIterations: number): SerializerBatchResult {
    // The serializers should never mutate the input values. However, they might mutate the outputs (e.g., superJson uses in-place deserialization).
    // To avoid any issues, we just generate a new input for each iteration.

    const warmupItems = items.slice(0, warmupIterations);
    const testItems = items.slice(warmupIterations);

    // A full GC before warmup starts every serializer from the same clean heap state, instead of inheriting garbage left behind by the previous one.
    forceGc();

    try {
        warmUpSerializer(serializer, warmupItems);
    }
    catch {
        // Warmup errors are not critical.
    }

    const result: SerializerBatchResult = {
        serializer: serializer.name,
        serializeMs: NaN,
        deserializeMs: NaN,
        toJsonMs: NaN,
        fromJsonMs: NaN,
        stringifyMs: NaN,
        parseMs: NaN,
        stringSizeBytes: NaN,
    };

    try {
        if ('serialize' in serializer) {
            forceGc();
            const [ serializeMs, serialized ] = measureFunction(testItems, value => serializer.serialize(value));
            result.serializeMs = serializeMs;

            forceGc();
            const [ toJsonMs, json ] = measureFunction(serialized, value => serializer.toJson(value));
            result.toJsonMs = toJsonMs;

            result.stringSizeBytes = sumSizeBytes(json) / json.length;

            forceGc();
            const [ fromJsonMs, reserialized ] = measureFunction(json, value => serializer.fromJson(value));
            result.fromJsonMs = fromJsonMs;

            forceGc();
            const [ deserializeMs ] = measureFunction(reserialized, value => serializer.deserialize(value));
            result.deserializeMs = deserializeMs;

            result.stringifyMs = result.serializeMs + result.toJsonMs;
            result.parseMs = result.deserializeMs + result.fromJsonMs;
        }
        else {
            forceGc();
            const [ stringifyMs, json ] = measureFunction(testItems, value => serializer.stringify(value));
            result.stringifyMs = stringifyMs;

            result.stringSizeBytes = sumSizeBytes(json) / json.length;

            forceGc();
            const [ parseMs ] = measureFunction(json, value => serializer.parse(value));
            result.parseMs = parseMs;
        }
    }
    catch (error) {
        printBenchmarkError(`Error measuring serializer '${serializer.name}' for scenario '${scenarioName}'.`, error, true);
    }

    return result;
}

function warmUpSerializer(serializer: Serializer, items: InputValue[] | InputValue[][]) {
    const elements = items.flatMap(item => Array.isArray(item) ? item : [ item ]);
    if ('serialize' in serializer) {
        for (const element of elements) {
            const serialized = serializer.serialize(element);
            const json = serializer.toJson(serialized);
            const reserialized = serializer.fromJson(json);
            serializer.deserialize(reserialized);
        }
    }
    else {
        for (const element of elements) {
            const json = serializer.stringify(element);
            serializer.parse(json);
        }
    }
}

function measureFunction<TIn, TOut>(items: TIn[], action: (item: TIn) => TOut): [number, TOut[]];

function measureFunction<TIn, TOut>(items: TIn[][], action: (item: TIn) => TOut): [number, TOut[][]];

function measureFunction<TIn, TOut>(items: TIn[] | TIn[][], action: (item: TIn) => TOut): [number, TOut[] | TOut[][]] {
    const isArray = items.length > 0 && Array.isArray(items[0]);
    let results: TOut[] | TOut[][];

    const startedAt = performance.now();

    if (isArray) {
        results = [] as TOut[][];

        for (const item of items as TIn[][]) {
            const arrayResults: TOut[] = [];
            for (const element of item)
                arrayResults.push(action(element));

            results.push(arrayResults);
        }
    }
    else {
        results = [] as TOut[];

        for (const item of items as TIn[])
            results.push(action(item));
    }

    const totalMs = performance.now() - startedAt;
    const iterations = items.length;

    return [
        totalMs / iterations,
        results,
    ];
}

function sumSizeBytes(values: string[] | string[][]): number {
    const isArray = values.length > 0 && Array.isArray(values[0]);
    let total = 0;

    if (isArray) {
        for (const array of values as string[][]) {
            for (const value of array)
                total += getUtf8ByteLength(value);
        }
    }
    else {
        for (const value of values as string[])
            total += getUtf8ByteLength(value);
    }

    return total;
}

function getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}

function printScenarioResults(result: ScenarioResult, serializers: Serializer[]) {
    const timeUnit = selectUnit('time', result.results.flatMap(r => [
        r.serializeMs.value,
        r.toJsonMs.value,
        r.deserializeMs.value,
        r.fromJsonMs.value,
    ]));
    const sizeUnit = selectUnit('size', result.results.map(r => r.stringSizeBytes.value));

    const orderedResults = serializers.map(serializer => result.results.find(r => r.serializer === serializer.name));

    const timeColumns = [ 'serializeMs', 'toJsonMs', 'deserializeMs', 'fromJsonMs', 'stringifyMs', 'parseMs' ] as const;

    // Each column finds its own best (smallest) value across serializers - the shared best marker/coloring make that comparison visible at a glance.
    const columns: { label: string, unit: Unit, stats: (Stat | undefined)[] }[] = [
        ...timeColumns.map(key => ({
            label: `${key.substring(0, key.length - 2)} (${timeUnit.label})`,
            unit: timeUnit,
            stats: orderedResults.map(r => r?.[key]),
        })),
        {
            label: `total (${timeUnit.label})`,
            unit: timeUnit,
            stats: orderedResults.map(r => r && addStats(r.stringifyMs, r.parseMs)),
        },
        {
            label: `size (${sizeUnit.label})`,
            unit: sizeUnit,
            stats: orderedResults.map(r => r?.stringSizeBytes),
        },
    ];

    const bestStats = columns.map(column => findBestStat(column.stats));
    const renderedColumns = columns.map((column, index) => {
        return column.stats.map(stat => renderRelativeCell(stat, column.unit, bestStats[index], undefined));
    });

    const table = new Table({
        head: [ 'serializer', ...columns.map(column => column.label) ],
        style: {
            head: [ 'white', 'bold' ],
            border: [ 'white' ],
        },
    });

    table.push([ 'Best', ...bestStats.map((stat, index) => formatBestStat(stat, columns[index]!.unit)) ]);

    serializers.forEach((serializer, rowIndex) => {
        table.push([ serializer.name, ...renderedColumns.map(column => column[rowIndex]!) ]);
    });

    process.stdout.write(table.toString());
    process.stdout.write('\n');
}

