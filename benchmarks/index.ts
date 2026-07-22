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
import { printComparisonTables } from './aggregate.js';
import { BENCHMARK_SEED, REFERENCE_DATE } from './config.js';
import { jsonSerializer, superJsonSerializer, uberJsonSerializer } from './serializers.js';

main();

function main() {
    faker.seed(BENCHMARK_SEED);
    faker.setDefaultRefDate(REFERENCE_DATE);

    const scenarios = createScenarios();
    const serializers = createSerializers();

    const scenarioResults = runScenarios(scenarios, serializers);
    printComparisonTables(scenarioResults);
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
        // UberJson always expands the objects as deep as possible, which results in an exponential growth on this specific scenario. Nevertheless, this is a very artificial scenario. In this case, the only correct way is to deduplicate - in which case, unfortunately, superJson throws an error.
        circularReferenceScenario(),

        repeatedTemporalValuesScenario(),
        mixedExtendedTypesScenario(),
    ];
}

function createSerializers() {
    return [
        jsonSerializer(),
        uberJsonSerializer('uberjson', new UberJson()),
        uberJsonSerializer('uberjson (deduplicate)', new UberJson({ deduplicate: true })),
        superJsonSerializer('superjson', new SuperJson()),
        superJsonSerializer('superjson (dedupe)', new SuperJson({ dedupe: true })),
    ];
}
