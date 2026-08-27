import type { ScenarioResult, SerializerResult } from './measure.js';
import { selectUnit, type Unit, type UnitType } from './utils.js';

export type ComparisonMetric = {
    id: string;
    /** If different from the id. */
    label?: string;
    unitType: UnitType;
    value: (result: SerializerResult) => number;
};

export type ComparisonGroup = {
    serializers: string[];
    label?: string;
};

export function printComparisonTables(results: ScenarioResult[], groups: ComparisonGroup[], metrics: ComparisonMetric[]) {
    for (const group of groups)
        printComparisonTable(results, group, metrics);
}

function printComparisonTable(results: ScenarioResult[], group: ComparisonGroup, metrics: ComparisonMetric[]) {
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
                const rowKey = `${String.fromCharCode('A'.charCodeAt(0) + serializerIndex)} ${metricIndex + 1}`;

                const serializerResult = bySerializer.get(serializerName);
                if (serializerResult === undefined) {
                    row[rowKey] = '-';
                }
                else {
                    const rawValue = metric.value(serializerResult);
                    const text = unit.format(rawValue);
                    row[rowKey] = highlightComparedValue(text, rawValue, bestCompared, bestGlobal);
                }

                serializerIndex++;
            }

            metricIndex++;
        }

        return row;
    });

    // const columns = [ 'scenario', ...metrics.flatMap(metric => group.serializers.map(serializerName => `${metric.label} (${unitsByMetric.get(metric.id)!.label}) / ${serializerName}`)) ];

    console.log('');

    const groupLabel = group.label ?? group.serializers.join(' vs ');
    console.log(`Comparison: ${groupLabel}`);

    const metricsLabel = metrics.map(metric => `${metric.label ?? metric.id} (${unitsByMetric.get(metric.id)!.label})`).join(', ');
    console.log(`Metrics: ${metricsLabel}`);

    console.table(rows);
    // console.table(rows, columns);
}

function selectUnitsByMetric(
    results: ScenarioResult[],
    serializerNames: string[],
    metrics: ComparisonMetric[],
): Map<string, Unit> {
    const units = new Map<string, Unit>();

    for (const metric of metrics) {
        const values: number[] = [];

        for (const scenarioResult of results) {
            for (const serializerResult of scenarioResult.results) {
                if (serializerNames.includes(serializerResult.serializer))
                    values.push(metric.value(serializerResult));
            }
        }

        const unit = selectUnit(metric.unitType, values);
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

    // We expect the best value to be the smaller one.
    const normalizedDiff = Math.abs((value - best) / best);
    return normalizedDiff <= 1e-4;
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
