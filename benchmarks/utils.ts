export type UnitType = 'time' | 'size';

export type Unit = {
    label: string;
    divisor: number;
    format: (value: number) => string;
};

export function selectUnit(unitType: UnitType, values: number[]): Unit {
    switch (unitType) {
        case 'time':
            return selectCommonUnit(values, timeUnits);
        case 'size':
            return selectCommonUnit(values, sizeUnits);
    }
}

const timeUnits: Unit[] = [
    { label: 'ms', divisor: 1 },
    { label: 's', divisor: 1_000 },
].map(unit => ({
    ...unit,
    format: (value: number) => formatNumber(value, unit.divisor),
}));

const sizeUnits: Unit[] = [
    { label: 'B', divisor: 1 },
    { label: 'KB', divisor: 1024 },
    { label: 'MB', divisor: 1024 ** 2 },
    { label: 'GB', divisor: 1024 ** 3 },
].map(unit => ({
    ...unit,
    format: (value: number) => formatNumber(value, unit.divisor),
}));

function selectCommonUnit(values: number[], units: Unit[]): Unit {
    const largestValue = Math.max(...values.filter(Number.isFinite), 0);

    let selectedUnit = units[0]!;
    for (const unit of units) {
        if (largestValue >= unit.divisor)
            selectedUnit = unit;
    }

    return selectedUnit;
}

function formatNumber(value: number, divisor: number): string {
    if (!Number.isFinite(value))
        return 'NaN';

    return (value / divisor).toFixed(3);
}
