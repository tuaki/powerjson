import Table from 'cli-table3';
import type { ScenarioResult, SerializerResult } from './measure.ts';
import { colorRed, formatAbsoluteStat, formatRatioStat, isApproximatelyEqual, isCloseToBest, BEST_MARKER, colorBrightGreen, colorGreen } from './format.ts';
import { selectUnit, type Stat, type Unit, type UnitType } from './utils.ts';

export type ComparisonMetric = {
    id: string;
    /** If different from the id. */
    label?: string;
    unitType: UnitType;
    value: (result: SerializerResult) => Stat;
};

export type ComparisonGroup = {
    serializers: string[];
    metrics: ComparisonMetric[];
    label?: string;
};

export function printComparisonTables(results: ScenarioResult[], groups: ComparisonGroup[]) {
    for (const group of groups)
        printComparisonTable(results, group);
}

function printComparisonTable(results: ScenarioResult[], group: ComparisonGroup) {
    const { metrics } = group;
    if (group.serializers.length === 0 || metrics.length === 0)
        return;

    const unitsByMetric = selectUnitsByMetric(results, group.serializers, metrics);

    const columns = [ 'scenario' ];
    for (let metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
        for (let serializerIndex = 0; serializerIndex < group.serializers.length; serializerIndex++)
            columns.push(`${String.fromCharCode('A'.charCodeAt(0) + serializerIndex)} ${metricIndex + 1}`);
    }

    const rows = results.map(result => {
        const bySerializer = new Map(result.results.map(serializerResult => [ serializerResult.serializer, serializerResult ]));
        const row = [ result.scenario.name ];

        const bestComparedByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBestForSerializers(result.results, metric, group.serializers) ]));
        const bestGlobalByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBest(result.results, metric) ]));

        for (const metric of metrics) {
            const unit = unitsByMetric.get(metric.id)!;
            const bestCompared = bestComparedByMetric.get(metric.id)!;
            const bestGlobal = bestGlobalByMetric.get(metric.id)!;

            for (const serializerName of group.serializers) {
                const serializerResult = bySerializer.get(serializerName);
                const stat = serializerResult && metric.value(serializerResult);
                row.push(renderComparedCell(stat, unit, bestCompared, bestGlobal));
            }
        }

        return row;
    });

    console.log('');

    const groupLabel = group.label ?? group.serializers.join(' vs ');
    console.log(`Comparison: ${groupLabel}`);

    const metricsLabel = metrics.map(metric => `${metric.label ?? metric.id} (${unitsByMetric.get(metric.id)!.label})`).join(', ');
    console.log(`Metrics: ${metricsLabel}`);

    const table = new Table({
        head: columns,
        style: {
            head: [ 'white', 'bold' ],
            border: [ 'white' ],
        },
    });

    table.push(...rows);

    process.stdout.write(table.toString());
    process.stdout.write('\n');
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
                    values.push(metric.value(serializerResult).value);
            }
        }

        const unit = selectUnit(metric.unitType, values);
        units.set(metric.id, unit);
    }

    return units;
}

function findMetricBest(results: SerializerResult[], metric: ComparisonMetric): Stat | undefined {
    const stats = results.map(result => metric.value(result)).filter(stat => Number.isFinite(stat.value));
    return stats.length > 0 ? stats.reduce((best, stat) => stat.value < best.value ? stat : best) : undefined;
}

function findMetricBestForSerializers(results: SerializerResult[], metric: ComparisonMetric, serializerNames: string[]): Stat | undefined {
    const stats = results
        .filter(result => serializerNames.includes(result.serializer))
        .map(result => metric.value(result))
        .filter(stat => Number.isFinite(stat.value));

    return stats.length > 0 ? stats.reduce((best, stat) => stat.value < best.value ? stat : best) : undefined;
}

/**
 * Renders one comparison cell:
 * - the best value within the compared group is shown in full (absolute value +- error, marked)
 * - every other one is shown as a ratio relative to that group's best.
 * - cells close to the group's best are colored green
 * - bright green if that group best also happens to be the best across every serializer (`bestGlobal`), not just the group
 */
function renderComparedCell(stat: Stat | undefined, unit: Unit, bestCompared: Stat | undefined, bestGlobal: Stat | undefined): string {
    if (!stat)
        return '-';

    if (!Number.isFinite(stat.value))
        return colorRed('-');

    if (!bestCompared || !isCloseToBest(stat.value, bestCompared.value))
        return bestCompared ? formatRatioStat(stat, bestCompared, unit) : '-';

    const isGroupBest = isApproximatelyEqual(stat.value, bestCompared.value);
    const text = isGroupBest ? `${BEST_MARKER} ${formatAbsoluteStat(stat, unit)}` : formatRatioStat(stat, bestCompared, unit);
    const isGlobalBest = bestGlobal !== undefined && isApproximatelyEqual(stat.value, bestGlobal.value);

    return isGlobalBest ? colorBrightGreen(text) : colorGreen(text);
}
