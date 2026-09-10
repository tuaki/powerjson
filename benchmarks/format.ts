import { RELATIVE_CLOSE_TO_BEST_THRESHOLD } from './config.ts';
import type { Stat, Unit } from './utils.ts';

export function colorBold(value: string): string {
    return `\u001b[1m${value}\u001b[22m`;
}

export function colorGreen(value: string): string {
    return `\u001b[32m${value}\u001b[0m`;
}

export function colorBrightGreen(value: string): string {
    return `\u001b[1;32m${value}\u001b[0m`;
}

export function colorRed(value: string): string {
    return `\u001b[31m${value}\u001b[0m`;
}

/** Whether `value` is (approximately) equal to `reference` - used to identify the actual source of a "best" value. */
function isApproximatelyEqual(value: number, reference: number): boolean {
    if (!Number.isFinite(value) || !Number.isFinite(reference))
        return false;

    return Math.abs((value - reference) / reference) <= 1e-3;
}

/** Whether `value` is close enough to `best` to still be highlighted, even though it isn't the best itself. */
function isCloseToBest(value: number, best: number): boolean {
    if (!Number.isFinite(value) || !Number.isFinite(best) || best === 0)
        return isApproximatelyEqual(value, best);

    return (value - best) / Math.abs(best) <= RELATIVE_CLOSE_TO_BEST_THRESHOLD;
}

/** Finds the smallest finite value in a set of Stats. */
export function findBestStat(stats: (Stat | undefined)[]): Stat | undefined {
    let bestIndex: number | undefined;
    let bestValue = Infinity;

    stats.forEach((stat, index) => {
        if (stat && Number.isFinite(stat.value) && stat.value < bestValue) {
            bestValue = stat.value;
            bestIndex = index;
        }
    });

    return bestIndex === undefined ? undefined : stats[bestIndex];
}

/** Formats the exact absolute best value; best columns intentionally never show an error estimate. */
export function formatBestStat(stat: Stat | undefined, unit: Unit): string {
    if (!stat || !Number.isFinite(stat.value))
        return colorRed('NaN');

    return (stat.value / unit.divisor).toFixed(3);
}

/** Formats a Stat's absolute value (scaled by `unit`), rounded to no more precision than its error justifies. */
export function formatAbsoluteStat(stat: Stat, unit: Unit): string {
    const value = stat.value / unit.divisor;

    if (unit.type === 'size' || !Number.isFinite(stat.error))
        return value.toFixed(3);

    const error = stat.error / unit.divisor;
    const decimals = decimalsForError(error);
    return `${value.toFixed(decimals)} ± ${error.toFixed(decimals)}`;
}

/** Formats `stat` as a ratio relative to `best` (e.g. "2.13" for "2.13 times worse"), with its own error propagated from both Stats. */
function formatRatioStat(stat: Stat, best: Stat, unit: Unit): string {
    const ratio = stat.value / best.value;

    if (unit.type === 'size' || !Number.isFinite(stat.error) || !Number.isFinite(best.error))
        return formatAdaptiveRatio(ratio);

    const relativeStatError = stat.value !== 0 ? stat.error / stat.value : 0;
    const relativeBestError = best.value !== 0 ? best.error / best.value : 0;
    const ratioError = ratio * Math.hypot(relativeStatError, relativeBestError);

    const decimals = decimalsForError(ratioError);
    return `${ratio.toFixed(decimals)} ± ${ratioError.toFixed(decimals)}`;
}

/**
 * Renders one comparison cell:
 * - the best value within the compared group is shown in full (absolute value +- error, marked)
 * - every other one is shown as a ratio relative to that group's best.
 * - cells close to the group's best are colored green
 * - bright green if that group best also happens to be the best across every serializer (`bestGlobal`), not just the group
 */
export function renderRelativeCell(stat: Stat | undefined, unit: Unit, bestCompared: Stat | undefined, bestGlobal: Stat | undefined): string {
    if (!stat || !bestCompared)
        return '-';

    if (!Number.isFinite(stat.value))
        return colorRed('NaN');

    const text = formatRatioStat(stat, bestCompared, unit);

    if (!isCloseToBest(stat.value, bestCompared.value))
        return text;

    const isGlobalBest = bestGlobal && isApproximatelyEqual(stat.value, bestGlobal.value);
    return isGlobalBest ? colorBrightGreen(text) : colorGreen(text);
}

/** Progressive-precision fallback for ratios with no usable error estimate (e.g. a single-batch scenario). */
function formatAdaptiveRatio(ratio: number): string {
    if (!Number.isFinite(ratio))
        return 'NaN';

    if (ratio >= 1000)
        return ratio.toExponential(1);
    if (ratio >= 100)
        return ratio.toFixed(0);
    if (ratio >= 10)
        return ratio.toFixed(1);

    return ratio.toFixed(2);
}

/**
 * Number of decimal places to display so that a value is shown with no more precision than its `error` justifies (i.e., 1 significant digit of error, or 2 if the leading digit is small - the usual physics rounding convention).
 * Falls back to a fixed, reasonable precision when there's no meaningful order of magnitude to derive it from (e.g. a zero error).
 */
function decimalsForError(error: number): number {
    if (!(error > 0))
        return 3;

    const magnitude = Math.floor(Math.log10(error));
    const leadingDigit = error / 10 ** magnitude;
    const significantDigits = leadingDigit <= 2 ? 2 : 1;

    return Math.min(Math.max(significantDigits - 1 - magnitude, 0), 6);
}
