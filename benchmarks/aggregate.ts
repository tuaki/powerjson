import type { ScenarioResult, SerializerResult } from './measure.js';
import { formatSize, formatTime, selectSizeUnit, selectTimeUnit, type SizeUnit, type TimeUnit } from './utils.js';

type ComparisonUnit = 'time' | 'size';

type ComparisonMetric = {
    id: string;
    label: string;
    unitType: ComparisonUnit;
    value: (result: SerializerResult) => number;
};

type SerializerComparisonGroup = {
    title: string;
    serializers: string[];
};

const COMPARED_METRICS: ComparisonMetric[] = [ {
    id: 'stringify',
    label: 'stringify',
    unitType: 'time',
    value: result => result.serializeMs + result.toJsonMs,
}, {
    id: 'parse',
    label: 'parse',
    unitType: 'time',
    value: result => result.deserializeMs + result.fromJsonMs,
}, {
    id: 'size',
    label: 'size',
    unitType: 'size',
    value: result => result.stringSizeBytes,
} ];

const SERIALIZER_GROUPS: SerializerComparisonGroup[] = [ {
    title: 'uberjson vs superjson',
    serializers: [ 'uberjson', 'superjson' ],
}, {
    title: 'uberjson (deduplicate) vs superjson (dedupe)',
    serializers: [ 'uberjson (deduplicate)', 'superjson (dedupe)' ],
} ];

export function printComparisonTables(results: ScenarioResult[]) {
    for (const group of SERIALIZER_GROUPS)
        printComparisonTable(results, group, COMPARED_METRICS);
}

function printComparisonTable(results: ScenarioResult[], group: SerializerComparisonGroup, metrics: ComparisonMetric[]) {
    if (group.serializers.length === 0 || metrics.length === 0)
        return;

    const unitsByMetric = selectUnitsByMetric(results, group.serializers, metrics);
    const rows = results.map(result => {
        const bySerializer = new Map(result.results.map(serializerResult => [ serializerResult.serializer, serializerResult ]));
        const row: Record<string, string> = { scenario: result.scenario.name };

        const bestComparedByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBestForSerializers(result.results, metric, group.serializers) ]));
        const bestGlobalByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBest(result.results, metric) ]));


        let metricIndex = 0;
        for (const metric of metrics) {

            const unit = unitsByMetric.get(metric.id)!;
            const bestCompared = bestComparedByMetric.get(metric.id)!;
            const bestGlobal = bestGlobalByMetric.get(metric.id)!;

            let serializerIndex = 0;
            for (const serializerName of group.serializers) {
                const serializerResult = bySerializer.get(serializerName);
                const rawValue = serializerResult ? metric.value(serializerResult) : NaN;
                const text = formatMetricValue(rawValue, metric.unitType, unit);

                row[`${String.fromCharCode('A'.charCodeAt(0) + serializerIndex)} ${metricIndex + 1}`] = highlightComparedValue(text, rawValue, bestCompared, bestGlobal);
                serializerIndex++;
            }

            metricIndex++;
        }

        return row;
    });

    // const columns = [ 'scenario', ...metrics.flatMap(metric => group.serializers.map(serializerName => `${metric.label} (${unitsByMetric.get(metric.id)!.label}) / ${serializerName}`)) ];

    console.log('');
    console.log(`Comparison: ${group.title}`);
    console.log(`Metrics: ${metrics.map(metric => `${metric.label} (${unitsByMetric.get(metric.id)!.label})`).join(', ')}`);
    console.table(rows);
    // console.table(rows, columns);
}

function selectUnitsByMetric(
    results: ScenarioResult[],
    serializerNames: string[],
    metrics: ComparisonMetric[],
): Map<string, TimeUnit | SizeUnit> {
    const units = new Map<string, TimeUnit | SizeUnit>();

    for (const metric of metrics) {
        const values: number[] = [];

        for (const scenarioResult of results) {
            for (const serializerResult of scenarioResult.results) {
                if (serializerNames.includes(serializerResult.serializer))
                    values.push(metric.value(serializerResult));
            }
        }

        const unit = metric.unitType === 'time' ? selectTimeUnit(values) : selectSizeUnit(values);
        units.set(metric.id, unit);
    }

    return units;
}

function findMetricBest(results: SerializerResult[], metric: ComparisonMetric): number {
    const values = results.map(result => metric.value(result)).filter(Number.isFinite);
    return values.length > 0 ? Math.min(...values) : NaN;
}

function findMetricBestForSerializers(results: SerializerResult[], metric: ComparisonMetric, serializerNames: string[]): number {
    const values = results
        .filter(result => serializerNames.includes(result.serializer))
        .map(result => metric.value(result))
        .filter(Number.isFinite);

    return values.length > 0 ? Math.min(...values) : NaN;
}

function isBest(value: number, best: number): boolean {
    if (!Number.isFinite(value) || !Number.isFinite(best))
        return false;

    return Math.abs(value - best) <= 1e-9;
}

function formatMetricValue(value: number, unitType: ComparisonUnit, unit: TimeUnit | SizeUnit): string {
    if (!Number.isFinite(value))
        return 'n/a';

    return unitType === 'time' ? formatTime(value, unit as TimeUnit) : formatSize(value, unit as SizeUnit);
}

function highlightComparedValue(valueText: string, value: number, bestCompared: number, bestGlobal: number): string {
    if (!isBest(value, bestCompared))
        return valueText;

    return isBest(value, bestGlobal) ? colorBrightGreen(valueText) : colorGreen(valueText);
}

function colorGreen(value: string): string {
    return `\u001b[32m${value}\u001b[0m`;
}

function colorBrightGreen(value: string): string {
    return `\u001b[1;32m${value}\u001b[0m`;
}
