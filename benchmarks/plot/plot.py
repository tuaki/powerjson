from math import ceil
from pathlib import Path
from typing import cast
from matplotlib.axes import Axes
from matplotlib.colors import ListedColormap
import matplotlib.pyplot as plt
from matplotlib.typing import ColorType
import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / 'data/plots'

# v1/v2 pairs share a hue, with v2 the brighter/more saturated of the two.
SERIALIZER_COLORS = {
    'powerjson v1': '#a8e6cf',
    'powerjson v2': '#1b9c85',
    'superjson v1': '#ffb3ba',
    'superjson v2': '#e63950',
    'danson v1': '#ffe1bd',
    'danson v2': '#ffb067',
    'devalue': '#bdb2ff',
    'serialize-javascript': '#fff1a8',
    'next-json': '#a0c4ff',
}
FALLBACK_COLORS = cast(tuple[ColorType, ...], cast(ListedColormap, plt.cm.Pastel1).colors)  # for serializers not listed in SERIALIZER_COLORS

def main() -> None:
    plot_csv('bun-parse.csv', 'time', 'Bun – parse')
    plot_csv('bun-stringify.csv', 'time', 'Bun – stringify')
    plot_csv('node-parse.csv', 'time', 'Node – parse')
    plot_csv('node-stringify.csv', 'time', 'Node – stringify')
    plot_csv('bun-size.csv', 'size', 'JSON size')

def plot_csv(filename: str, unit_type: str, title: str) -> None:
    """Plots best/value (instead of value/best): naturally bounded in (0, 1] (1.0 = best), so bad results shrink towards 0 without needing to be capped, however extreme they are."""
    csv_path, serializers, normalized, raw_errors_normalized, scenario_labels = load_normalized(filename, unit_type)

    values = 1 / normalized

    errors = None
    if raw_errors_normalized is not None:
        # Error propagation for y = 1/x: dy = dx / x^2.
        errors = raw_errors_normalized / normalized ** 2

    render_bars(
        f'{csv_path.stem}.svg',
        title,
        serializers,
        values,
        errors,
        scenario_labels,
        f'best {unit_type} / {unit_type} (1.0 = best)',
    )

def load_normalized(filename: str, unit_type: str):
    """Loads a CSV and normalizes each scenario's values against its best (smallest) value.

    Returns (csv_path, serializers, normalized, raw_errors_normalized, scenario_labels).
    `normalized` is >= 1, with 1.0 marking the best serializer for that scenario.
    `raw_errors_normalized` is None for size CSVs, which carry no error columns.
    """
    csv_path = DATA_DIR / filename
    df = pd.read_csv(csv_path)
    serializers = load_serializers(df)

    raw_values = df[serializers]

    best = raw_values.min(axis=1, skipna=True)
    normalized = raw_values.div(best, axis=0)

    raw_errors_normalized = None
    if unit_type == 'time':
        raw_errors = df[[f'{s}_err' for s in serializers]]
        raw_errors.columns = serializers
        raw_errors_normalized = raw_errors.div(best, axis=0)

    units = UNIT_TABLES[unit_type]
    scenario_labels = [
        f'{name}\n(best: {format_number(value, divisor)} {label})'
        for name, value, (label, divisor) in zip(
            df['scenario'],
            best,
            (select_common_unit((value,), units) for value in best),
        )
    ]

    return csv_path, serializers, normalized, raw_errors_normalized, scenario_labels

def load_serializers(df: pd.DataFrame) -> list[str]:
    return [col for col in df.columns if col != 'scenario' and not col.endswith('_err')]

def render_bars(
    file_name: str,
    title: str,
    serializers: list[str],
    values: pd.DataFrame,
    errors: pd.DataFrame | None,
    scenario_labels: list[str],
    ylabel: str,
) -> None:
    x = np.arange(len(scenario_labels))
    slot_width = 0.8 / len(serializers)
    # Leave a slight gap between bars of the same scenario.
    width = slot_width * 0.85

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.set_xlim(x[0] - 0.5, x[-1] + 0.5)

    for i in range(len(scenario_labels) - 1):
        ax.axvline(i + 0.5, color='lightgray', linewidth=1, zorder=0)

    linewidth = 1.2
    # A patch's edge straddles its boundary (half the linewidth sticks out on each side), so a bar with a border is wider than one without.
    # Shrink the hatched bar's nominal width by the edge's own width - converted from points to data x-units, since `width` and `linewidth` use different units - so its total rendered width (fill + border) matches a normal, border-less bar.
    hatched_width = width - points_to_data_width(ax, linewidth)

    for i, serializer in enumerate(serializers):
        offset = (i - (len(serializers) - 1) / 2) * slot_width
        color = SERIALIZER_COLORS.get(serializer, FALLBACK_COLORS[i % len(FALLBACK_COLORS)])
        bar_x = x + offset

        heights = values[serializer].to_numpy()
        missing = np.isnan(heights)
        plot_heights = np.where(missing, MISSING_BAR_HEIGHT, heights)

        ax.bar(
            bar_x[~missing],
            plot_heights[~missing],
            width,
            label=serializer,
            color=color,
            zorder=2,
        )

        if missing.any():
            # Mark NaN (unsupported/failed) results as hatched, empty bars instead of just omitting them.
            ax.bar(
                bar_x[missing],
                plot_heights[missing],
                width=hatched_width,
                facecolor="white",
                edgecolor=color,
                hatch="//",
                linewidth=linewidth,
                zorder=2,
            )

        if errors is not None:
            # Draw the error bar manually: bar's own yerr always caps both ends, but we only want the bottom one.
            err = errors[serializer].to_numpy()
            has_error = ~missing & np.isfinite(err)
            tops = heights[has_error]
            bottoms = tops - err[has_error]
            error_x = bar_x[has_error]
            ax.vlines(error_x, bottoms, tops, color="black", linewidth=1, zorder=3)
            cap_half_width = width * 0.3
            ax.hlines(bottoms, error_x - cap_half_width, error_x + cap_half_width, color="black", linewidth=1, zorder=3)

    ax.set_xticks(x)
    ax.set_xticklabels(scenario_labels, rotation=20, ha='right')
    ax.set_ylabel(ylabel)
    ax.set_title(title, pad=44)
    ax.legend(loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=ceil(len(serializers) / 2), frameon=False)
    fig.tight_layout()

    file_path = DATA_DIR / file_name
    fig.savefig(file_path)
    plt.close(fig)
    print(f'Plotted {file_path}')

def points_to_data_width(ax: Axes, points: float) -> float:
    """Converts a length in points (e.g. a patch's linewidth) to the equivalent length along the x data axis."""
    pixels = points * ax.figure.dpi / 72
    (x0, _), (x1, _) = ax.transData.inverted().transform([(0, 0), (pixels, 0)])
    return abs(x1 - x0)

MISSING_BAR_HEIGHT = 0.1

Units = list[tuple[str, float]]
TIME_UNITS: Units = [('μs', 0.001), ('ms', 1), ('s', 1_000)]
SIZE_UNITS: Units = [('B', 1), ('KB', 1_000), ('MB', 1_000_000), ('GB', 1_000_000_000)]
UNIT_TABLES = {'time': TIME_UNITS, 'size': SIZE_UNITS}

def select_common_unit(values: tuple[float, ...], units: list[tuple[str, float]]) -> tuple[str, float]:
    finite = [v for v in values if np.isfinite(v)]
    largest = max(finite, default=0)

    selected = units[0]
    for unit in units:
        if largest >= unit[1]:
            selected = unit
    return selected

def format_number(value: float, divisor: float) -> str:
    if not np.isfinite(value):
        return 'NaN'

    formatted = f'{value / divisor:.3f}'
    return formatted.removesuffix('.000')  # e.g. whole byte counts don't need trailing zeros

if __name__ == '__main__':
    main()
