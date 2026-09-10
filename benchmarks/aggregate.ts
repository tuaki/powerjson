import Table from 'cli-table3';
import type { ScenarioResult, SerializerResult } from './measure.ts';
import { formatBestStat, colorBold, renderRelativeCell } from './format.ts';
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
        const metric = metrics[metricIndex]!;
        const unit = unitsByMetric.get(metric.id)!;
        columns.push(`Best (${unit.label})`);
        columns.push(...group.serializers);
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

            row.push(formatBestStat(bestCompared, unit));

            for (const serializerName of group.serializers) {
                const serializerResult = bySerializer.get(serializerName);
                const stat = serializerResult && metric.value(serializerResult);
                row.push(renderRelativeCell(stat, unit, bestCompared, bestGlobal));
            }
        }

        return row;
    });

    console.log('');

    const table = new Table({
        // There is no head - we need to create a custom header because we want the multi-column metrics first.
        style: {
            border: [ 'white' ],
        },
    });

    table.push([
        { content: '', colSpan: 1 },
        ...metrics.map(metric => ({
            content: colorBold(metric.label ?? metric.id),
            colSpan: group.serializers.length + 1,
        })),
    ]);
    table.push(columns.map(column => colorBold(column)));

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
