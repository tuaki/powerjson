import { faker } from '@faker-js/faker';
import SuperJson from 'superjson';
import { UberJson } from '../src/uberJson.js';
import { type Scenario, runScenarios } from './measure.js';
import { exampleScenario } from './scenarios/example.js';
import { realisticApiCallScenario } from './scenarios/realisticApiCall.js';
import { smallPayloadBurstScenario } from './scenarios/smallPayloadBurst.js';
import { sharedReferenceScenario } from './scenarios/sharedReference.js';
import { circularReferenceScenario } from './scenarios/circularReference.js';
import { repeatedTemporalValuesScenario } from './scenarios/repeatedTemporalValues.js';
import { mixedExtendedTypesScenario } from './scenarios/mixedExtendedTypes.js';
import { printComparisonTables, type ComparisonGroup, type ComparisonMetric } from './aggregate.js';
import { REFERENCE_DATE } from './config.js';
import { jsonSerializer, superJsonSerializer, uberJsonSerializer } from './serializers.js';

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
        sharedReferenceScenario(), // We should lower the size. Deduplicated is larger than superjson's deduplicated.

        // This is actually a bug in superJson.
        // Their serializer caches transformed results for all objects it sees. If it sees the same object again, it will either return a reference (if `dedupe: true`) or the cached result.
        // However, if `dedupe: false`, serialization depends on the path to the object - because the path is used to break cycles. So, an object like `a: { b: { c: a } }` should break the cycle when encountering `a` for the second time, while the same cycle but starting from `b` should break the cycle at `b`.
        // UberJson always expands the objects as deep as possible, which results in an exponential growth on this specific scenario. Nevertheless, this is a very artificial scenario. In this case, the only reasonable way is to deduplicate - in which case, unfortunately, superJson throws an error.
        circularReferenceScenario(),

        repeatedTemporalValuesScenario(),
        mixedExtendedTypesScenario(),
    ];
}

function createSerializers() {
    return [
        jsonSerializer(),

        uberJsonSerializer('uberjson', new UberJson({ deduplicate: false })),
        superJsonSerializer('superjson', new SuperJson()),

        uberJsonSerializer('uberjson (deduplicate)', new UberJson({ deduplicate: true, sortObjectKeys: false })),
        superJsonSerializer('superjson (dedupe)', new SuperJson({ dedupe: true })),
    ];
}

const comparisonGroups: ComparisonGroup[] = [ {
    serializers: [ 'uberjson', 'superjson' ],
}, {
    serializers: [ 'uberjson (deduplicate)', 'superjson (dedupe)' ],
} ];

const comparisonMetrics: ComparisonMetric[] = [ {
    id: 'stringify',
    unitType: 'time',
    value: result => result.serializeMs + result.toJsonMs,
}, {
    id: 'parse',
    unitType: 'time',
    value: result => result.deserializeMs + result.fromJsonMs,
}, {
    id: 'size',
    unitType: 'size',
    value: result => result.stringSizeBytes,
} ];

main();
