import { BENCHMARK_ITERATIONS_SCALE, DISPLAY_ERRORS, DISPLAY_VERBOSE_RESULTS } from './config.js';
import { formatSize, formatTime, selectSizeUnit, selectTimeUnit, type SizeUnit, type TimeUnit } from './utils.js';

type InputValue = unknown;

type Serializer<TSerialized = unknown> = {
    name: string;
    serialize(value: InputValue): TSerialized;
    deserialize(value: TSerialized): InputValue;
    toJson(value: TSerialized): string;
    fromJson(text: string): TSerialized;
    skip?(scenario: Scenario): boolean;
};

export function createSerializer<TSerialized>(
    name: string,
    serializer: Omit<Serializer<TSerialized>, 'name'>,
): Serializer<TSerialized> {
    return {
        name,
        ...serializer,
    };
}

export type Scenario = {
    id: string;
    name: string;
    description: string;
    jsonCompatible: boolean;
    /** Number of iterations for which the results are stable enough. */
    iterations: number;
    /** If array is returned, it will be serialized by items (we measure the total time). */
    getData(): InputValue | InputValue[];
};

export function runScenarios(scenarios: Scenario[], serializers: Serializer[]): ScenarioResult[] {
    if (DISPLAY_VERBOSE_RESULTS)
        console.log(`Running ${scenarios.length} benchmark scenarios...`);

    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
        try {
            if (DISPLAY_VERBOSE_RESULTS) {
                console.log('');
                console.log(`Scenario: ${scenario.name}`);
                console.log(scenario.description);
            }

            const result = runScenario(scenario, serializers);
            results.push(result);
            if (DISPLAY_VERBOSE_RESULTS)
                printScenarioResults(result);
        }
        catch (error) {
            printError(`Error running scenario '${scenario.name}'.`, error);
        }
    }

    return results;
}

export type ScenarioResult = {
    scenario: Scenario;
    results: SerializerResult[];
};

function runScenario(scenario: Scenario, serializers: Serializer[]): ScenarioResult {
    const measureIterations = Math.max(1, Math.floor(scenario.iterations * BENCHMARK_ITERATIONS_SCALE));
    const warmupIterations = Math.max(1, Math.floor(measureIterations * WARMUP_ITERATIONS_RATIO));
    const items = Array.from({ length: measureIterations + warmupIterations }, () => scenario.getData());
    const results: SerializerResult[] = [];

    for (const serializer of serializers) {
        if (serializer.skip?.(scenario))
            continue;

        try {
            const serializerResult = measureSerializer(serializer, items, warmupIterations);
            results.push(serializerResult);
        }
        catch (error) {
            printError(`Error measuring serializer '${serializer.name}' for scenario '${scenario.name}'.`, error);
            results.push({
                serializer: serializer.name,
                serializeMs: NaN,
                toJsonMs: NaN,
                deserializeMs: NaN,
                fromJsonMs: NaN,
                stringSizeBytes: NaN,
            });
        }
    }

    return {
        scenario,
        results,
    };
}

export type SerializerResult = {
    serializer: string;
    serializeMs: number;
    toJsonMs: number;
    deserializeMs: number;
    fromJsonMs: number;
    stringSizeBytes: number;
};

function measureSerializer(serializer: Serializer, items: InputValue[] | InputValue[][], warmupIterations: number): SerializerResult {
    // The serializers should never mutate the input values. However, they might mutate the outputs (e.g., superJson uses in-place deserialization).
    // To avoid any issues, we just generate a new input for each iteration.
    // However, we don't wan't to call `getData` multiple times because it might would produce different data each time. Yes, we can fix it with an explicit faker instance, but let's just move on.

    const warmupItems = items.slice(0, warmupIterations);
    const testItems = items.slice(warmupIterations);

    warmUpSerializer(serializer, warmupItems);

    const [ serializeMs, serialized ] = measureFunction(testItems, value => serializer.serialize(value));
    const [ toJsonMs, json ] = measureFunction(serialized, value => serializer.toJson(value));

    const stringSizeBytes = sumSizeBytes(json) / json.length;

    const [ fromJsonMs, reserialized ] = measureFunction(json, value => serializer.fromJson(value));
    const [ deserializeMs ] = measureFunction(reserialized, value => serializer.deserialize(value));

    return {
        serializer: serializer.name,
        serializeMs,
        deserializeMs,
        toJsonMs,
        fromJsonMs,
        stringSizeBytes,
    };
}

const WARMUP_ITERATIONS_RATIO = 0.1;

function warmUpSerializer(serializer: Serializer, items: InputValue[] | InputValue[][]) {
    const elements = items.flatMap(item => Array.isArray(item) ? item : [ item ]);
    for (const element of elements) {
        const serialized = serializer.serialize(element);
        const json = serializer.toJson(serialized);
        const reserialized = serializer.fromJson(json);
        serializer.deserialize(reserialized);
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

function printError(message: string, error: unknown) {
    if (DISPLAY_ERRORS)
        console.error(message, '\n', error);
    else
        console.error(message);
}

function printScenarioResults(result: ScenarioResult) {
    const timeUnit = selectTimeUnit(result.results.flatMap(result => [
        result.serializeMs,
        result.toJsonMs,
        result.deserializeMs,
        result.fromJsonMs,
    ]));
    const sizeUnit = selectSizeUnit(result.results.map(result => result.stringSizeBytes));

    console.table(result.results.map(serializerResult => mapSerializerResultToTableRow(serializerResult, timeUnit, sizeUnit)));
}

function mapSerializerResultToTableRow(result: SerializerResult, timeUnit: TimeUnit, sizeUnit: SizeUnit) {
    const stringifyMs = result.serializeMs + result.toJsonMs;
    const parseMs = result.deserializeMs + result.fromJsonMs;
    const totalMs = stringifyMs + parseMs;

    return {
        serializer: result.serializer,
        serialize: formatTime(result.serializeMs, timeUnit),
        toJson: formatTime(result.toJsonMs, timeUnit),
        deserialize: formatTime(result.deserializeMs, timeUnit),
        fromJson: formatTime(result.fromJsonMs, timeUnit),
        stringify: formatTime(stringifyMs, timeUnit),
        parse: formatTime(parseMs, timeUnit),
        [`total (${timeUnit.label})`]: formatTime(totalMs, timeUnit),
        [`size (${sizeUnit.label})`]: formatSize(result.stringSizeBytes, sizeUnit),
    };
}
