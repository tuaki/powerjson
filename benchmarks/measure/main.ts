import { faker } from '@faker-js/faker';
import { runScenarios } from './measure.ts';
import { exampleScenario } from './scenarios/example.ts';
import { realisticApiCallScenario } from './scenarios/realisticApiCall.ts';
import { smallPayloadBurstScenario } from './scenarios/smallPayloadBurst.ts';
import { sharedReferencesScenario } from './scenarios/sharedReferences.ts';
import { circularReferencesScenario } from './scenarios/circularReferences.ts';
import { repeatedTemporalValuesScenario } from './scenarios/repeatedTemporalValues.ts';
import { mixedExtendedTypesScenario } from './scenarios/mixedExtendedTypes.ts';
import { printComparisonTables, saveComparisonTables, type ComparisonGroup, type ComparisonMetric, type ComparisonTable } from './aggregate.ts';
import { ONLY_EXAMPLE_SCENARIO, REFERENCE_DATE } from './config.ts';
import { jsonSerializer, powerJsonSerializer, superJsonSerializer, dansonSerializer, devalueSerializer, serializeJavascriptSerializer, nextJsonSerializer } from './serializers.ts';
import { CliFormatter } from './format.ts';

function main() {
    faker.setDefaultRefDate(REFERENCE_DATE);

    const scenarios = createScenarios();
    const serializers = createSerializers();

    const scenarioResults = runScenarios(scenarios, serializers, cliFormatter);
    printComparisonTables(scenarioResults, comparisonGroups);
    saveComparisonTables(scenarioResults, comparisonTables);
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
        dansonSerializer({ deduplicate: false }),
        dansonSerializer({ deduplicate: true }),
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

const cliFormatter = new CliFormatter();
// const markdownFormatter = new MarkdownFormatter();

const nonJsonSerializers = [ 'powerjson v1', 'powerjson v2', 'superjson v1', 'superjson v2', 'danson v1', 'danson v2', 'devalue', 'serialize-javascript', 'next-json' ];

const comparisonGroups: ComparisonGroup[] = [ {
    serializers: [ 'powerjson v1', 'superjson v1' ],
    metrics: allMetrics,
    formatter: cliFormatter,
}, {
    serializers: [ 'powerjson v2', 'superjson v2' ],
    metrics: allMetrics,
    formatter: cliFormatter,
}, {
//     serializers: nonJsonSerializers,
//     metrics: [ allMetrics[0] ],
//     formatter: markdownFormatter,
// }, {
//     serializers: nonJsonSerializers,
//     metrics: [ allMetrics[1] ],
//     formatter: markdownFormatter,
// }, {
//     serializers: nonJsonSerializers,
//     metrics: [ allMetrics[2] ],
//     formatter: markdownFormatter,
// }, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[0] ],
    formatter: cliFormatter,
}, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[1] ],
    formatter: cliFormatter,
}, {
    serializers: nonJsonSerializers,
    metrics: [ allMetrics[2] ],
    formatter: cliFormatter,
} ];

const comparisonTables: ComparisonTable[] = [ {
    serializers: nonJsonSerializers,
    metric: allMetrics[0],
}, {
    serializers: nonJsonSerializers,
    metric: allMetrics[1],
}, {
    serializers: nonJsonSerializers,
    metric: allMetrics[2],
} ];

main();
