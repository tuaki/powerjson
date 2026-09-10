import { faker } from '@faker-js/faker';
import { runScenarios } from './measure.ts';
import { exampleScenario } from './scenarios/example.ts';
import { realisticApiCallScenario } from './scenarios/realisticApiCall.ts';
import { smallPayloadBurstScenario } from './scenarios/smallPayloadBurst.ts';
import { sharedReferencesScenario } from './scenarios/sharedReferences.ts';
import { circularReferencesScenario } from './scenarios/circularReferences.ts';
import { repeatedTemporalValuesScenario } from './scenarios/repeatedTemporalValues.ts';
import { mixedExtendedTypesScenario } from './scenarios/mixedExtendedTypes.ts';
import { printComparisonTables, type ComparisonGroup, type ComparisonMetric } from './aggregate.ts';
import { ONLY_EXAMPLE_SCENARIO, REFERENCE_DATE } from './config.ts';
import { devalueSerializer, jsonSerializer, nextJsonSerializer, serializeJavascriptSerializer, superJsonSerializer, powerJsonSerializer } from './serializers.ts';

function main() {
    faker.setDefaultRefDate(REFERENCE_DATE);

    const scenarios = createScenarios();
    const serializers = createSerializers();

    const scenarioResults = runScenarios(scenarios, serializers);
    printComparisonTables(scenarioResults, comparisonGroups);
}

function createScenarios() {
    return ONLY_EXAMPLE_SCENARIO ? [
        exampleScenario(),
    ] : [
        realisticApiCallScenario(),
        smallPayloadBurstScenario(),
        sharedReferencesScenario(),
        circularReferencesScenario(),
        repeatedTemporalValuesScenario(),
        mixedExtendedTypesScenario(),
    ];
}

function createSerializers() {
    return [
        jsonSerializer(),
        powerJsonSerializer({ deduplicate: false }),
        powerJsonSerializer({ deduplicate: true }),
        superJsonSerializer({ deduplicate: false }),
        superJsonSerializer({ deduplicate: true }),
        devalueSerializer(),
        serializeJavascriptSerializer(),
        nextJsonSerializer(),
    ];
}

const allMetrics: ComparisonMetric[] = [ {
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

const nonJsonSerializers = [ 'powerjson v1', 'powerjson v2', 'superjson v1', 'superjson v2', 'devalue', 'serialize-javascript', 'next-json' ];

const comparisonGroups: ComparisonGroup[] = [ {
    serializers: [ 'powerjson v1', 'superjson v1' ],
    metrics: allMetrics,
}, {
    serializers: [ 'powerjson v2', 'superjson v2' ],
    metrics: allMetrics,
}, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[0] ],
}, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[1] ],
}, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[2] ],
} ];

main();
