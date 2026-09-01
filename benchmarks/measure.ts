import { faker } from '@faker-js/faker';
import Table from 'cli-table3';
import { BENCHMARK_ITERATIONS_SCALE, BENCHMARK_SEED, DISPLAY_ERROR_STACKS, DISPLAY_VERBOSE_RESULTS } from './config.ts';
import { selectUnit, type Unit } from './utils.ts';

const WARMUP_ITERATIONS_RATIO = 0.1;

type InputValue = unknown;

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

type Serializer<TSerializer = unknown> = SimpleSerializer | ComplexSerializer<TSerializer>;

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

    const runningResultsBySerializer: Map<string, SerializerResult[]> = new Map();

    for (let i = 0; i < batches; i++) {
        const batchResult = runScenarioBatch(scenario, serializers);

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

        const averageResult: SerializerResult = {
            serializer: serializer.name,
            serializeMs: averageByKey(serializerResults, 'serializeMs'),
            toJsonMs: averageByKey(serializerResults, 'toJsonMs'),
            deserializeMs: averageByKey(serializerResults, 'deserializeMs'),
            fromJsonMs: averageByKey(serializerResults, 'fromJsonMs'),
            stringifyMs: averageByKey(serializerResults, 'stringifyMs'),
            parseMs: averageByKey(serializerResults, 'parseMs'),
            stringSizeBytes: averageByKey(serializerResults, 'stringSizeBytes'),
        };

        results.push(averageResult);
    }

    return {
        scenario,
        results,
    };
}

function averageByKey<TKey extends string>(items: { [P in TKey]: number }[], key: TKey) {
    const sum = items.reduce((ans, item) => ans + item[key], 0);
    return sum / items.length;
}

function runScenarioBatch(scenario: Scenario, serializers: Serializer[]): SerializerResult[] {
    const measureIterations = Math.max(1, Math.floor(scenario.iterations * BENCHMARK_ITERATIONS_SCALE));
    const warmupIterations = Math.max(1, Math.floor(measureIterations * WARMUP_ITERATIONS_RATIO));

    faker.seed(BENCHMARK_SEED);
    const items = Array.from({ length: measureIterations + warmupIterations }, () => scenario.getData());

    const results: SerializerResult[] = [];

    for (const serializer of serializers) {
        if (scenario.skipSerializers?.includes(serializer.name))
            continue;

        const serializerResult = measureSerializer(scenario.name, serializer, items, warmupIterations);
        results.push(serializerResult);
    }

    return results;
}

export type SerializerResult = {
    serializer: string;
    serializeMs: number;
    toJsonMs: number;
    deserializeMs: number;
    fromJsonMs: number;
    stringifyMs: number;
    parseMs: number;
    stringSizeBytes: number;
};

function measureSerializer(scenarioName: string, serializer: Serializer, items: InputValue[] | InputValue[][], warmupIterations: number): SerializerResult {
    // The serializers should never mutate the input values. However, they might mutate the outputs (e.g., superJson uses in-place deserialization).
    // To avoid any issues, we just generate a new input for each iteration.

    const warmupItems = items.slice(0, warmupIterations);
    const testItems = items.slice(warmupIterations);

    try {
        warmUpSerializer(serializer, warmupItems);
    }
    catch {
        // Warmup errors are not critical.
    }

    const result: SerializerResult = {
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
            const [ serializeMs, serialized ] = measureFunction(testItems, value => serializer.serialize(value));
            result.serializeMs = serializeMs;

            const [ toJsonMs, json ] = measureFunction(serialized, value => serializer.toJson(value));
            result.toJsonMs = toJsonMs;

            result.stringSizeBytes = sumSizeBytes(json) / json.length;

            const [ fromJsonMs, reserialized ] = measureFunction(json, value => serializer.fromJson(value));
            result.fromJsonMs = fromJsonMs;

            const [ deserializeMs ] = measureFunction(reserialized, value => serializer.deserialize(value));
            result.deserializeMs = deserializeMs;

            result.stringifyMs = result.serializeMs + result.toJsonMs;
            result.parseMs = result.deserializeMs + result.fromJsonMs;
        }
        else {
            const [ stringifyMs, json ] = measureFunction(testItems, value => serializer.stringify(value));
            result.stringifyMs = stringifyMs;

            result.stringSizeBytes = sumSizeBytes(json) / json.length;

            const [ parseMs ] = measureFunction(json, value => serializer.parse(value));
            result.parseMs = parseMs;
        }
    }
    catch (error) {
        printError(`Error measuring serializer '${serializer.name}' for scenario '${scenarioName}'.`, error, true);
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

const seenErrors = new Set<string>();

function printError(message: string, error: unknown, onlyUnique = false) {
    if (onlyUnique && seenErrors.has(message))
        return;

    seenErrors.add(message);

    if (DISPLAY_ERROR_STACKS)
        console.error(message, '\n', error);
    else
        console.error(message);
}

function printScenarioResults(result: ScenarioResult, serializers: Serializer[]) {
    const timeUnit = selectUnit('time', result.results.flatMap(result => [
        result.serializeMs,
        result.toJsonMs,
        result.deserializeMs,
        result.fromJsonMs,
    ]));
    const sizeUnit = selectUnit('size', result.results.map(result => result.stringSizeBytes));

    const table = new Table({
        head: [
            'serializer',
            'serialize',
            'toJson',
            'deserialize',
            'fromJson',
            'stringify',
            'parse',
            `total (${timeUnit.label})`,
            `size (${sizeUnit.label})`,
        ],
        style: {
            head: [ 'white', 'bold' ],
            border: [ 'white' ],
        },
    });

    table.push(...serializers.map(serializer => mapSerializerResultToTableRow(serializer, result.results, timeUnit, sizeUnit)));

    process.stdout.write(table.toString());
    process.stdout.write('\n');
}

function mapSerializerResultToTableRow(serializer: Serializer, results: SerializerResult[], timeUnit: Unit, sizeUnit: Unit) {
    const result = results.find(r => r.serializer === serializer.name);
    if (!result) {
        return [
            serializer.name,
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
        ];
    }

    const totalMs = result.stringifyMs + result.parseMs;

    return [
        result.serializer,
        timeUnit.format(result.serializeMs),
        timeUnit.format(result.toJsonMs),
        timeUnit.format(result.deserializeMs),
        timeUnit.format(result.fromJsonMs),
        timeUnit.format(result.stringifyMs),
        timeUnit.format(result.parseMs),
        timeUnit.format(totalMs),
        sizeUnit.format(result.stringSizeBytes),
    ];
}
