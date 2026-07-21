export type TimeUnit = {
    label: string;
    divisor: number;
};

const timeUnits: TimeUnit[] = [
    { label: 'ms', divisor: 1 },
    { label: 's', divisor: 1_000 },
];

export function selectTimeUnit(values: number[]): TimeUnit {
    return selectCommonUnit(values, timeUnits) as TimeUnit;
}

export function formatTime(valueMs: number, timeUnit: TimeUnit): string {
    return (valueMs / timeUnit.divisor).toFixed(3);
}

export type SizeUnit = {
    label: string;
    divisor: number;
};

const sizeUnits: SizeUnit[] = [
    { label: 'B', divisor: 1 },
    { label: 'KB', divisor: 1024 },
    { label: 'MB', divisor: 1024 ** 2 },
    { label: 'GB', divisor: 1024 ** 3 },
];

export function selectSizeUnit(values: number[]): SizeUnit {
    return selectCommonUnit(values, sizeUnits) as SizeUnit;
}

export function formatSize(valueBytes: number, sizeUnit: SizeUnit): string {
    return (valueBytes / sizeUnit.divisor).toFixed(3);
}

function selectCommonUnit(values: number[], units: TimeUnit[] | SizeUnit[]): TimeUnit | SizeUnit {
    const largestValue = Math.max(...values.filter(Number.isFinite), 0);

    let selectedUnit = units[0]!;
    for (const unit of units) {
        if (largestValue >= unit.divisor)
            selectedUnit = unit;
    }

    return selectedUnit;
}
