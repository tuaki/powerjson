# Benchmarks

In PowerJson, performance is a first-class concern. These benchmarks help us to both track down performance bottlenecks and compare PowerJson to other libraries.

## Scope

We consider the following libraries:

- `powerjson`
    - Both `deduplicate: false` and `deduplicate: true` (marked as v1 and v2 respectively).
- [`superjson`](https://github.com/ravionhq/superjson)
    - Both `dedupe: false` and `dedupe: true` (marked as v1 and v2 respectively).
- [`devalue`](https://github.com/sveltejs/devalue)
- [`serialize-JavaScript`](https://github.com/yahoo/serialize-javascript)
- [`next-json`](https://github.com/iccicci/next-json)

If you know of any other promising libraries, please open an issue or submit a pull request.

There are several benchmark scenarios, each with a different focus. Check out the [benchmarks/scenarios/](../benchmarks/scenarios/) directory for the complete list. We try to cover both realistic scenarios and synthetic edge cases. However, we obviously can't cover everything, so if you have any scenario worth benchmarking, please open an issue or submit a pull request.

## Running the benchmarks

You can run the basic version with:

```sh
bun run --expose-gc benchmarks/index.ts
node --expose-gc benchmarks/index.ts
```

For better results, benchmarks try to use `nice` to increase the process priority. This usually requires either root privileges or editing `/etc/security/limits.conf`. Also, `taskset` is used to pin the process to a single logical CPU. Use `BENCHMARK_CPU` to override the default CPU selection (e.g., if you want to run multiple benchmarks in parallel). Combined together:

```sh
sudo BENCHMARK_CPU=0 bun run --expose-gc benchmarks/index.ts
sudo BENCHMARK_CPU=2 node --expose-gc benchmarks/index.ts
```

Crucially, check your CPU's topology before assigning logical CPUs (e.g., using `lscpu -e`). For example, [our CPU](#configuration) assigns both 0 and 1 to the same physical core, which is why we use 0 and 2 instead. Additionally, some physical cores are more powerful than others, so run the benchmarks on cores of the same quality.

Benchmark inputs are deterministic through the seed and reference date in `benchmarks/config.ts`. There you can adjust `BENCHMARK_ITERATIONS_SCALE` to increase the sample size when investigating performance; use values of at least `1` for meaningful comparisons. Avoid treating an individual benchmark run as conclusive because runtime noise can affect results.

## Configuration

- kernel: 7.1.4-arch1-1
- CPU: 13th Gen Intel i9-13900HX (32) @ 5.200GHz 
- RAM: 64 GB @ 5.600 GHz

| library              | version |
| -------------------- | ------- |
| bun                  | 1.4.0   |
| node                 | 26.8.1  |
| powerjson            | 1.0.0   |
| superjson            | 2.2.6   |
| devalue              | 5.9.1   |
| next-json            | 0.5.1   |
| serialize-javascript | 7.1.0   |

## Results

The results are displayed as relative values (i.e., the best result is always 1.00). The `Best` column shows the absolute value and its unit. The best (or close to best) value is highlighted. Whenever a benchmark fails, the result (and subsequent results, i.e., parsing after a failed serialization) is marked as `NaN`. Skipped benchmarks (for any reason) are marked as `-`.

### Bun - stringify

| scenario                 | Best (ms) | powerjson v1    | powerjson v2    | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json   |
| ------------------------ | --------- | --------------- | --------------- | ------------ | ------------ | --------------- | -------------------- | ----------- |
| Realistic API Call       | 11.595    | **1.00 ± 0.06** | 1.57 ± 0.10     | 6.5 ± 0.6    | 6.3 ± 0.4    | 2.6 ± 0.2       | 2.45 ± 0.13          | 2.7 ± 0.2   |
| Small Payload Burst      | 5.982     | **1.00 ± 0.05** | 1.23 ± 0.05     | 4.49 ± 0.16  | 4.59 ± 0.16  | 3.09 ± 0.15     | 2.90 ± 0.10          | 3.24 ± 0.12 |
| Shared References        | 1.079     | 1.50 ± 0.20     | **1.00 ± 0.10** | 5.2 ± 0.4    | 2.45 ± 0.18  | 2.04 ± 0.20     | 5.2 ± 0.4            | 1.48 ± 0.12 |
| Circular References      | 0.013     | 3210 ± 417      | 2.2 ± 0.3       | 46 ± 7       | *NaN*        | **1.00 ± 0.18** | *NaN*                | 8 ± 5       |
| Repeated Temporal Values | 1.086     | **1.00 ± 0.13** | 1.07 ± 0.15     | 8.6 ± 0.8    | 5.0 ± 0.5    | 4.5 ± 0.6       | 5.6 ± 0.6            | 3.1 ± 0.4   |
| Mixed Extended Types     | 0.025     | **1.00 ± 0.12** | 1.07 ± 0.13     | 5.9 ± 0.6    | 5.9 ± 0.7    | 1.7 ± 0.3       | 3.1 ± 0.3            | 2.1 ± 0.2   |


### Bun - parse

| scenario                 | Best (ms) | powerjson v1    | powerjson v2      | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json  |
| ------------------------ | --------- | --------------- | ----------------- | ------------ | ------------ | --------------- | -------------------- | ---------- |
| Realistic API Call       | 13.139    | 1.08 ± 0.03     | **1.000 ± 0.018** | 2.77 ± 0.06  | 2.50 ± 0.06  | 1.16 ± 0.03     | 4.16 ± 0.17          | 31 ± 2     |
| Small Payload Burst      | 5.844     | **1.00 ± 0.03** | 1.09 ± 0.02       | 1.60 ± 0.06  | 1.57 ± 0.06  | 1.82 ± 0.04     | 9.45 ± 0.20          | 24.2 ± 0.5 |
| Shared References        | 0.629     | 3.7 ± 0.3       | **1.00 ± 0.11**   | 12.5 ± 1.3   | 3.3 ± 0.3    | 1.11 ± 0.10     | 12.8 ± 1.0           | 34 ± 3     |
| Circular References      | 0.008     | 3025 ± 306      | 2.1 ± 0.3         | 51 ± 9       | *NaN*        | **1.00 ± 0.13** | *NaN*                | 35 ± 5     |
| Repeated Temporal Values | 1.303     | **1.02 ± 0.16** | **1.00 ± 0.17**   | 6.3 ± 0.8    | 2.7 ± 0.4    | 1.2 ± 0.2       | 6.2 ± 0.8            | 42 ± 5     |
| Mixed Extended Types     | 0.023     | **1.03 ± 0.18** | **1.00 ± 0.17**   | 2.3 ± 0.4    | 2.3 ± 0.3    | 1.19 ± 0.19     | 3.9 ± 0.5            | 11.2 ± 1.6 |

### Node - stringify

| scenario                 | Best (ms) | powerjson v1 | powerjson v2       | superjson v1 | superjson v2 | devalue       | serialize-javascript | next-json   |
| ------------------------ | --------- | ------------ | ------------------ | ------------ | ------------ | ------------- | -------------------- | ----------- |
| Realistic API Call       | 21.965    | **1.00 ± 0.19** | 1.40 ± 0.19     | 4.2 ± 0.6    | 3.9 ± 0.6    | 1.8 ± 0.3     | 1.6 ± 0.2            | 1.8 ± 0.3   |
| Small Payload Burst      | 13.024    | **1.00 ± 0.04** | **1.03 ± 0.13** | 3.14 ± 0.16  | 3.1 ± 0.2    | 2.05 ± 0.16   | 1.67 ± 0.07          | 1.91 ± 0.10 |
| Shared References        | 1.612     | 2.4 ± 0.2       | **1.00 ± 0.04** | 5.4 ± 0.2    | 1.95 ± 0.13  | 1.14 ± 0.04   | 4.76 ± 0.16          | 1.15 ± 0.05 |
| Circular References      | 0.055     | 910 ± 391       | 2.2 ± 1.3       | 11 ± 5       | *NaN*        | **1.0 ± 0.6** | *NaN*                | 2.6 ± 1.3   |
| Repeated Temporal Values | 2.438     | **1.00 ± 0.10** | 1.08 ± 0.09     | 4.4 ± 0.3    | 1.93 ± 0.15  | 1.45 ± 0.11   | 2.35 ± 0.18          | 1.31 ± 0.10 |
| Mixed Extended Types     | 0.064     | **1.00 ± 0.08** | **1.03 ± 0.08** | 2.51 ± 0.16  | 2.48 ± 0.15  | 1.10 ± 0.07   | 1.39 ± 0.09          | 1.33 ± 0.08 |

### Node - parse

| scenario                 | Best (ms) | powerjson v1 | powerjson v2 | superjson v1 | superjson v2 | devalue           | serialize-javascript | next-json  |
| ------------------------ | --------- | ------------ | ------------ | ------------ | ------------ | ----------------- | -------------------- | ---------- |
| Realistic API Call       | 17.293    | 1.47 ± 0.11  | 1.6 ± 0.3    | 2.4 ± 0.2    | 2.16 ± 0.16  | **1.00 ± 0.09**   | 3.0 ± 0.2            | 23.5 ± 1.6 |
| Small Payload Burst      | 12.548    | 1.25 ± 0.05  | 1.20 ± 0.04  | 1.36 ± 0.02  | 1.37 ± 0.04  | **1.000 ± 0.019** | 1.34 ± 0.05          | 12.4 ± 0.2 |
| Shared References        | 0.638     | 7.1 ± 0.3    | 2.21 ± 0.07  | 12.2 ± 0.3   | 2.59 ± 0.08  | **1.00 ± 0.03**   | 9 ± 5                | 41.7 ± 1.1 |
| Circular References      | 0.041     | 1516 ± 1492  | 2 ± 2        | 15 ± 14      | *NaN*        | **1.0 ± 1.4**     | *NaN*                | 22 ± 21    |
| Repeated Temporal Values | 1.007     | 2.90 ± 0.18  | 2.99 ± 0.20  | 6.9 ± 0.4    | 2.21 ± 0.13  | **1.00 ± 0.07**   | 2.93 ± 0.18          | 51 ± 2     |
| Mixed Extended Types     | 0.031     | 1.88 ± 0.19  | 1.88 ± 0.18  | 2.4 ± 0.2    | 2.3 ± 0.2    | 1.32 ± 0.12       | **1.00 ± 0.10**      | 12.6 ± 0.9 |

### Size

| scenario                 | Best (MB) | powerjson v1 | powerjson v2 | superjson v1 | superjson v2 | devalue  | serialize-javascript | next-json |
| ------------------------ | --------- | ------------ | ------------ | ------------ | ------------ | -------- | -------------------- | --------- |
| Realistic API Call       | 1.645     | 1.38         | 1.24         | 1.55         | 1.39         | 1.09     | 1.19                 | **1.00**  |
| Small Payload Burst      | 1.075     | 1.15         | 1.15         | 1.26         | 1.26         | 1.14     | 1.06                 | **1.00**  |
| Shared References        | 0.091     | 5.60         | 1.67         | 6.90         | 1.75         | 1.13     | 5.27                 | **1.00**  |
| Circular References      | 0.001     | 6.7e+3       | 2.79         | 147          | 4.78         | **1.00** | *NaN*                | 1.47      |
| Repeated Temporal Values | 0.210     | 2.00         | 2.00         | 2.62         | 1.49         | 1.12     | 1.76                 | **1.00**  |
| Mixed Extended Types     | 0.002     | 1.36         | 1.36         | 1.47         | 1.46         | 1.15     | 1.11                 | **1.00**  |

## Discussion

Both `serialize-javascript` and `next-json` use a custom grammar to extend the JSON format, allowing them to achieve smaller sizes in most scenarios. The price for this is inability to use the built-in `JSON.parse` and `JSON.stringify` functions, which are highly optimized in both Node and Bun, thus resulting in a poor performance. Specifically `next-json` is abysmal for parsing.

`devalue` uses a specific, non-human-readable serialization scheme (that is, however, still a valid JSON). This allows it to achieve the smallest or close-to-smallest sizes in all scenarios, while still being one of the fastest libraries. If you don't care about human-readability or long-term stability of the serialized format, `devalue` is a great choice.

Both `powerjson` and `superjson` are generally OK in terms of size, except for scenarios with a lot of references without deduplication. Specifically, `v1` of both libraries explode in the *Circular References* scenario. However, `v2` fixes this issue. Besides that, `powerjson` produces almost everywhere smaller output than `superjson`.

When it comes to speed, `powerjson`, again, outperforms `superjson` in almost every scenario, usually several times over. A much closer match is `powerjson` vs `devalue`, where the latter has an edge in parsing on Node, but `powerjson` is generally faster in other cases.

Another takeaway is that Bun is in most scenarios faster than Node, and in some of them, it's not particularly close.
