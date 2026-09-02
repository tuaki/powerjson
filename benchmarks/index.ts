import { faker } from '@faker-js/faker';
import { type Scenario, runScenarios } from './measure.ts';
import { exampleScenario } from './scenarios/example.ts';
import { realisticApiCallScenario } from './scenarios/realisticApiCall.ts';
import { smallPayloadBurstScenario } from './scenarios/smallPayloadBurst.ts';
import { sharedReferencesScenario } from './scenarios/sharedReferences.ts';
import { circularReferencesScenario } from './scenarios/circularReferences.ts';
import { repeatedTemporalValuesScenario } from './scenarios/repeatedTemporalValues.ts';
import { mixedExtendedTypesScenario } from './scenarios/mixedExtendedTypes.ts';
import { printComparisonTables, type ComparisonGroup, type ComparisonMetric } from './aggregate.ts';
import { REFERENCE_DATE } from './config.ts';
import { devalueSerializer, jsonSerializer, nextJsonSerializer, serializeJavascriptSerializer, superJsonSerializer, uberJsonSerializer } from './serializers.ts';

function main() {
    faker.setDefaultRefDate(REFERENCE_DATE);

    const scenarios = createScenarios();
    const serializers = createSerializers();

    const scenarioResults = runScenarios(scenarios, serializers);
    printComparisonTables(scenarioResults, comparisonGroups, comparisonMetrics);
}

function createScenarios(): Scenario[] {
    return [
        exampleScenario(),

        realisticApiCallScenario(), // Already better

        smallPayloadBurstScenario(), // Already better
        sharedReferencesScenario(), // We should lower the size. Deduplicated is larger than superjson's deduplicated.

        // This is actually a bug in superJson.
        // Their serializer caches transformed results for all objects it sees. If it sees the same object again, it will either return a reference (if `dedupe: true`) or the cached result.
        // However, if `dedupe: false`, serialization depends on the path to the object - because the path is used to break cycles. So, an object like `a: { b: { c: a } }` should break the cycle when encountering `a` for the second time, while the same cycle but starting from `b` should break the cycle at `b`.
        // UberJson always expands the objects as deep as possible, which results in an exponential growth on this specific scenario. Nevertheless, this is a very artificial scenario. In this case, the only reasonable way is to deduplicate - in which case, unfortunately, superJson throws an error.
        circularReferencesScenario(),

        repeatedTemporalValuesScenario(),
        mixedExtendedTypesScenario(),
    ];
}

function createSerializers() {
    return [
        jsonSerializer(),

        uberJsonSerializer({ deduplicate: false }),
        uberJsonSerializer({ deduplicate: true }),

        superJsonSerializer({ dedupe: false }),
        superJsonSerializer({ dedupe: true }),

        devalueSerializer(),

        serializeJavascriptSerializer(),

        nextJsonSerializer(),
    ];
}

const comparisonGroups: ComparisonGroup[] = [ {
    serializers: [ 'uberjson-simple', 'superjson-default' ],
}, {
    serializers: [ 'uberjson-deduplicate', 'superjson-dedupe' ],
}, {
    serializers: [ 'uberjson-simple', 'uberjson-deduplicate', 'superjson-default', 'superjson-dedupe', 'devalue', 'serialize-javascript', 'next-json' ],
} ];

const comparisonMetrics: ComparisonMetric[] = [ {
    id: 'stringify',
    unitType: 'time',
    value: result => result.stringifyMs,
}, {
    id: 'parse',
    unitType: 'time',
    value: result => result.parseMs,
}, {
    id: 'size',
    unitType: 'size',
    value: result => result.stringSizeBytes,
} ];

main();
