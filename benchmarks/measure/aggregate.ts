import type { ScenarioResult, SerializerResult } from './measure.ts';
import { formatBestStat, renderRelativeCell, type Formatter } from './format.ts';
import { getRuntime, getRunTimestamp, selectUnit, type Stat, type Unit, type UnitType } from './utils.ts';
import { OUTPUT_PATH } from './config.ts';
import { stringify } from 'csv-stringify/sync';
import path from 'node:path';
import fs from 'node:fs';

export type ComparisonGroup = {
    serializers: string[];
    metrics: ComparisonMetric[];
    formatter: Formatter;
};

export type ComparisonMetric = {
    id: string;
    /** If different from the id. */
    label?: string;
    unitType: UnitType;
    value: (result: SerializerResult) => Stat;
};

export function printComparisonTables(results: ScenarioResult[], groups: ComparisonGroup[]) {
    for (const group of groups)
        printComparisonTable(results, group);
}

function printComparisonTable(results: ScenarioResult[], group: ComparisonGroup) {
    const { serializers, metrics, formatter } = group;
    if (group.serializers.length === 0 || metrics.length === 0)
        return;

    const unitsByMetric = selectUnitsByMetric(results, serializers, metrics);

    const columns = [ 'scenario' ];
    for (const metric of metrics) {
        const unit = unitsByMetric.get(metric.id)!;
        columns.push(`Best (${unit.label})`);
        columns.push(...serializers);
    }

    const rows = results.map(result => {
        const bySerializer = new Map(result.results.map(serializerResult => [ serializerResult.serializer, serializerResult ]));
        const row = [ result.scenario.name ];

        const bestComparedByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBestForSerializers(result.results, metric, serializers) ]));
        const bestGlobalByMetric = new Map(metrics.map(metric => [ metric.id, findMetricBest(result.results, metric) ]));

        for (const metric of metrics) {
            const unit = unitsByMetric.get(metric.id)!;
            const bestCompared = bestComparedByMetric.get(metric.id)!;
            const bestGlobal = bestGlobalByMetric.get(metric.id)!;

            row.push(formatBestStat(bestCompared, unit));

            for (const serializer of serializers) {
                const serializerResult = bySerializer.get(serializer);
                const stat = serializerResult && metric.value(serializerResult);
                row.push(renderRelativeCell(formatter, stat, unit, bestCompared, bestGlobal));
            }
        }

        return row;
    });

    console.log('');

    const table = formatter.createTable();

    table.push([
        { content: '', colSpan: 1 },
        ...metrics.map(metric => ({
            content: metric.label ?? metric.id,
            colSpan: serializers.length + 1,
        })),
    ]);
    table.push(columns);

    table.push(...rows);

    process.stdout.write(formatter.table(table, 2));
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

export type ComparisonTable = {
    serializers: string[];
    metric: ComparisonMetric;
};

export function saveComparisonTables(results: ScenarioResult[], tables: ComparisonTable[]) {
    for (const table of tables)
        saveComparisonTable(results, table);
}

function saveComparisonTable(results: ScenarioResult[], table: ComparisonTable) {
    const { serializers, metric } = table;

    const header = [
        'scenario',
        // Time units have errors, so we add an extra column for them.
        ...(metric.unitType === 'time' ? serializers.flatMap(serializer => [ serializer, `${serializer}_err` ]) : serializers),
    ];

    const rows = results.map(result => {
        const bySerializer = new Map(result.results.map(serializerResult => [ serializerResult.serializer, serializerResult ]));
        const row: (string | number)[] = [ result.scenario.name ];

        for (const serializer of serializers) {
            const serializerResult = bySerializer.get(serializer);
            const stat = serializerResult && metric.value(serializerResult);
            row.push(stat?.value ?? NaN);
            if (metric.unitType === 'time')
                row.push(stat?.error ?? NaN);
        }

        return row;
    });

    writeCsvTable(table, [ header, ...rows ]);
}

function writeCsvTable(table: ComparisonTable, csv: unknown[]) {
    const csvString = stringify(csv);

    if (!fs.existsSync(OUTPUT_PATH))
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });

    const fileName = `${getRunTimestamp()}-${getRuntime()}-${table.metric.id}.csv`;
    const filePath = path.join(OUTPUT_PATH, fileName);

    fs.writeFileSync(filePath, csvString);

    console.log(`Saved comparison table to ${filePath}`);
}
