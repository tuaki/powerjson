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

Crucially, check your CPU's topology before assigning logical CPUs. For example, [our CPU](#configuration) assigns both 0 and 1 to the same physical core, which is why we use 0 and 2 instead. Additionally, some physical cores are more powerful than others, so run the benchmarks on cores of the same quality.

Benchmark inputs are deterministic through the seed and reference date in `benchmarks/config.ts`. There you can adjust `BENCHMARK_ITERATIONS_SCALE` to increase the sample size when investigating performance; use values of at least `1` for meaningful comparisons. Avoid treating an individual benchmark run as conclusive because runtime noise can affect results.

## Configuration

- kernel: 7.1.4-arch1-1
- CPU: 13th Gen Intel i9-13900HX (32) @ 5.200GHz 
- RAM: 64 GB @ 5.600 GHz

| library              | version |
| -------------------- | ------- |
| bun                  | 1.4.0   |
| node                 | 26.8.1  |
| powerjson            | 0.0.2   |
| superjson            | 2.2.6   |
| devalue              | 5.9.1   |
| next-json            | 0.5.1   |
| serialize-javascript | 7.1.0   |

## Results

The results are displayed as relative values (i.e., the best result is always 1.00). The `Best` column shows the absolute value and its unit. The best (or close to best) value is highlighted. Whenever a benchmark fails, the result (and subsequent results, i.e., parsing after a failed serialization) is marked as `NaN`. Skipped benchmarks (for any reason) are marked as `-`.

### Bun - stringify

| scenario                 | Best (ms) | powerjson v1      | powerjson v2    | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json   |
| ------------------------ | --------- | ----------------- | --------------- | ------------ | ------------ | --------------- | -------------------- | ----------- |
| Realistic API Call       | 10.975    | **1.00 ± 0.08**   | 1.38 ± 0.11     | 6.3 ± 0.4    | 6.3 ± 0.4    | 2.7 ± 0.4       | 2.41 ± 0.14          | -           |
| Small Payload Burst      | 5.443     | **1.000 ± 0.011** | 1.36 ± 0.10     | 4.93 ± 0.17  | 4.9 ± 0.2    | 3.44 ± 0.06     | 3.33 ± 0.13          | -           |
| Shared References        | 1.064     | 1.52 ± 0.19       | **1.00 ± 0.07** | 5.1 ± 0.3    | 2.50 ± 0.18  | 2.17 ± 0.20     | 5.0 ± 0.3            | 1.44 ± 0.13 |
| Circular References      | 0.010     | 3298 ± 260        | 2.2 ± 0.2       | 54 ± 5       | *NaN*        | **1.00 ± 0.11** | *NaN*                | 7 ± 5       |
| Repeated Temporal Values | 0.950     | **1.00 ± 0.06**   | 1.12 ± 0.13     | 8.7 ± 0.5    | 4.9 ± 0.3    | 4.6 ± 0.2       | 5.3 ± 0.3            | -           |
| Mixed Extended Types     | 0.024     | **1.00 ± 0.11**   | 1.10 ± 0.12     | 6.1 ± 0.7    | 6.1 ± 0.6    | 1.7 ± 0.3       | 3.2 ± 0.3            | 2.2 ± 0.3   |

### Bun - parse

| scenario                 | Best (ms) | powerjson v1    | powerjson v2    | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json  |
| ------------------------ | --------- | --------------- | --------------- | ------------ | ------------ | --------------- | -------------------- | ---------- |
| Realistic API Call       | 12.311    | 1.08 ± 0.09     | **1.00 ± 0.05** | 2.7 ± 0.3    | 2.41 ± 0.09  | 1.15 ± 0.05     | 4.16 ± 0.16          | -          |
| Small Payload Burst      | 5.767     | **1.00 ± 0.06** | 1.13 ± 0.07     | 1.58 ± 0.12  | 1.61 ± 0.09  | 1.90 ± 0.19     | 9.8 ± 0.7            | -          |
| Shared References        | 0.638     | 3.5 ± 0.3       | **1.00 ± 0.13** | 11.5 ± 1.2   | 3.8 ± 1.2    | **1.04 ± 0.11** | 12.2 ± 1.1           | 33 ± 3     |
| Circular References      | 0.006     | 3187 ± 201      | 1.96 ± 0.17     | 53 ± 9       | *NaN*        | **1.00 ± 0.09** | *NaN*                | 41 ± 5     |
| Repeated Temporal Values | 1.218     | **1.00 ± 0.12** | **1.01 ± 0.14** | 6.2 ± 0.6    | 2.6 ± 0.2    | 1.17 ± 0.13     | 5.8 ± 0.5            | -          |
| Mixed Extended Types     | 0.023     | **1.02 ± 0.17** | **1.00 ± 0.15** | 2.4 ± 0.3    | 2.3 ± 0.3    | 1.22 ± 0.15     | 4.0 ± 0.5            | 11.3 ± 1.3 |

### Node - stringify

| scenario                 | Best (ms) | powerjson v1      | powerjson v2    | superjson v1 | superjson v2 | devalue       | serialize-javascript | next-json   |
| ------------------------ | --------- | ----------------- | --------------- | ------------ | ------------ | ------------- | -------------------- | ----------- |
| Realistic API Call       | 22.105    | **1.000 ± 0.003** | **1.04 ± 0.08** | 3.70 ± 0.12  | 3.37 ± 0.06  | 1.58 ± 0.06   | 1.49 ± 0.12          | -           |
| Small Payload Burst      | 24.894    | 1.4 ± 0.2         | **1.0 ± 0.5**   | 1.93 ± 0.15  | 1.87 ± 0.16  | 1.2 ± 0.4     | **1.00 ± 0.10**      | -           |
| Shared References        | 1.788     | 3.6 ± 0.5         | **1.00 ± 0.10** | 5.7 ± 0.4    | 2.00 ± 0.18  | 1.27 ± 0.12   | 4.9 ± 0.4            | 1.57 ± 0.12 |
| Circular References      | 0.044     | 940 ± 410         | 2.2 ± 1.3       | 12 ± 5       | *NaN*        | **1.0 ± 0.6** | *NaN*                | 4 ± 2       |
| Repeated Temporal Values | 2.744     | **1.00 ± 0.11**   | 1.07 ± 0.11     | 4.2 ± 0.4    | 1.9 ± 0.2    | 1.40 ± 0.17   | 2.16 ± 0.19          | -           |
| Mixed Extended Types     | 0.071     | **1.00 ± 0.10**   | **1.04 ± 0.10** | 2.5 ± 0.2    | 2.5 ± 0.2    | 1.09 ± 0.10   | 1.39 ± 0.13          | 1.42 ± 0.12 |

### Node - parse

| scenario                 | Best (ms) | powerjson v1 | powerjson v2 | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json  |
| ------------------------ | --------- | ------------ | ------------ | ------------ | ------------ | --------------- | -------------------- | ---------- |
| Realistic API Call       | 15.964    | 1.48 ± 0.14  | 1.38 ± 0.13  | 2.25 ± 0.04  | 2.10 ± 0.09  | **1.00 ± 0.02** | 2.85 ± 0.05          | -          |
| Small Payload Burst      | 12.715    | 1.5 ± 0.3    | 1.4 ± 0.2    | 1.6 ± 0.3    | 1.6 ± 0.3    | **1.0 ± 0.2**   | 1.6 ± 0.3            | -          |
| Shared References        | 0.793     | 6.9 ± 0.6    | 2.1 ± 0.3    | 11.3 ± 1.0   | 2.5 ± 0.2    | **1.00 ± 0.12** | 8 ± 5                | 38 ± 3     |
| Circular References      | 0.016     | 3259 ± 856   | 3.7 ± 1.2    | 33 ± 6       | *NaN*        | **1.0 ± 0.2**   | *NaN*                | 53 ± 10    |
| Repeated Temporal Values | 1.127     | 2.7 ± 0.3    | 2.8 ± 0.3    | 6.5 ± 0.7    | 2.1 ± 0.2    | **1.00 ± 0.13** | 2.8 ± 0.3            | -          |
| Mixed Extended Types     | 0.034     | 1.9 ± 0.2    | 1.9 ± 0.2    | 2.4 ± 0.2    | 2.4 ± 0.2    | 1.34 ± 0.13     | **1.00 ± 0.11**      | 12.7 ± 1.1 |

### Size

| scenario                 | Best (MB) | powerjson v1 | powerjson v2 | superjson v1 | superjson v2 | devalue  | serialize-javascript | next-json |
| ------------------------ | --------- | ------------ | ------------ | ------------ | ------------ | -------- | -------------------- | --------- |
| Example                  | 0.017     | 1.38         | 1.24         | 1.55         | 1.39         | 1.09     | 1.18                 | **1.00**  |
| Realistic API Call       | 1.793     | 1.27         | 1.14         | 1.42         | 1.27         | **1.00** | 1.09                 | -         |
| Small Payload Burst      | 1.137     | 1.09         | 1.09         | 1.19         | 1.19         | 1.08     | **1.00**             | -         |
| Shared References        | 0.091     | 5.60         | 1.67         | 6.90         | 1.75         | 1.13     | 5.27                 | **1.00**  |
| Circular References      | 0.001     | 6.7e+3       | 2.79         | 147          | 4.78         | **1.00** | *NaN*                | 1.47      |
| Repeated Temporal Values | 0.235     | 1.79         | 1.79         | 2.35         | 1.33         | **1.00** | 1.57                 | -         |
| Mixed Extended Types     | 0.002     | 1.36         | 1.36         | 1.47         | 1.46         | 1.15     | 1.11                 | **1.00**  |

## Discussion

Both `serialize-javascript` and `next-json` use a custom grammar to extend the JSON format, allowing them to achieve smaller sizes in some scenarios. The price for this is inability to use the built-in `JSON.parse` and `JSON.stringify` functions, which are highly optimized in both Node and Bun, thus resulting in a poor performance. Specifically `next-json` is skipped in several scenarios because its abysmal performance causes significant delays.

`devalue` uses a specific, non-human-readable serialization scheme (that is, however, still a valid JSON). This allows it to achieve the smallest or close-to-smallest sizes in most scenarios, while still being one of the fastest libraries. If you don't care about human-readability or long-term stability of the serialized format, `devalue` is a great choice.

Both `powerjson` and `superjson` are generally OK in terms of size, except for scenarios with a lot of references without deduplication. Specifically, `v1` of both libraries explodes in the *Circular References* scenario. However, `v2` fixes this issue. Besides that, `powerjson` produces almost everywhere smaller output than `superjson`.

When it comes to speed, `powerjson`, again, outperforms `superjson` in almost every scenario, usually several times over. A much closer match is `powerjson` vs `devalue`, where the latter has an edge in parsing on Node, but `powerjson` is generally faster in other cases.

Another takeaway is that Bun is in most scenarios faster than Node, and in some of them, it's not particularly close. We also run the benchmarks with switched CPUs to rule out any bias there, and the results are consistent.
