import { faker } from '@faker-js/faker';
import SuperJson from 'superjson';
import { UberJson } from '../src/uberJson.js';
import { createSerializer, type Scenario, runScenarios } from './measure.js';
import { exampleScenario } from './scenarios/example.js';
import { realisticApiCallScenario } from './scenarios/realisticApiCall.js';
import { smallPayloadBurstScenario } from './scenarios/smallPayloadBurst.js';
import { sharedReferenceScenario } from './scenarios/sharedReference.js';
import { circularReferenceScenario } from './scenarios/circularReference.js';
import { repeatedTemporalValuesScenario } from './scenarios/repeatedTemporalValues.js';
import { mixedExtendedTypesScenario } from './scenarios/mixedExtendedTypes.js';
import { printComparisonTables } from './aggregate.js';
import { BENCHMARK_SEED, REFERENCE_DATE } from './config.js';

const serializers = createSerializers();
const scenarios = createBenchmarkPlan();

const scenarioResults = runScenarios(scenarios, serializers);
printComparisonTables(scenarioResults);

function createBenchmarkPlan(): Scenario[] {
    faker.seed(BENCHMARK_SEED);
    faker.setDefaultRefDate(REFERENCE_DATE);

    return [
        exampleScenario(),
        realisticApiCallScenario(), // Already better
        smallPayloadBurstScenario(), // Already better
        sharedReferenceScenario(), // We should lower the size. Deduplicated is larger than superjson's deduplicated.
        circularReferenceScenario(), // We need to fix this one - both too slow and too large.
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

function jsonSerializer() {
    return createSerializer('JSON', {
        serialize: value => value,
        deserialize: value => value,
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
        skip: scenario => !scenario.jsonCompatible,
    });
}

function uberJsonSerializer(name: string, serializer: UberJson) {
    return createSerializer(name, {
        serialize: value => serializer.serialize(value),
        deserialize: serialized => serializer.deserialize(serialized),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}

function superJsonSerializer(name: string, serializer: SuperJson) {
    return createSerializer(name, {
        serialize: value => serializer.serialize(value),
        deserialize: serialized => serializer.deserialize(serialized, { inPlace: true }),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}
