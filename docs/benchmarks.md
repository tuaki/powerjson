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
| node                 | 26.8.2  |
| powerjson            | 1.2.1   |
| superjson            | 2.2.6   |
| devalue              | 5.9.1   |
| next-json            | 0.5.1   |
| serialize-javascript | 7.1.0   |

## Results

The results are displayed as relative values (i.e., the best result is always 1.00). The `Best` column shows the absolute value and its unit. The best (or close to best) value is highlighted. Whenever a benchmark fails, the result (and subsequent results, i.e., parsing after a failed serialization) is marked as `NaN`. Skipped benchmarks (for any reason) are marked as `-`.

### Bun - stringify

| scenario                 | Best (ms) | powerjson v1    | powerjson v2    | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json   |
| ------------------------ | --------- | --------------- | --------------- | ------------ | ------------ | --------------- | -------------------- | ----------- |
| Realistic API Call       | 11.589    | **1.00 ± 0.02** | 1.57 ± 0.07     | 6.8 ± 0.4    | 6.51 ± 0.16  | 2.72 ± 0.15     | 2.5 ± 0.2            | 2.70 ± 0.04 |
| Small Payload Burst      | 6.379     | **1.00 ± 0.04** | 1.19 ± 0.04     | 4.50 ± 0.16  | 4.47 ± 0.18  | 3.15 ± 0.09     | 2.78 ± 0.12          | 3.22 ± 0.08 |
| Shared References        | 1.103     | 1.51 ± 0.20     | **1.00 ± 0.09** | 5.2 ± 0.3    | 2.46 ± 0.16  | 2.14 ± 0.15     | 4.9 ± 0.3            | 1.46 ± 0.12 |
| Circular References      | 0.011     | 3568 ± 378      | 2.5 ± 0.3       | 51 ± 6       | *NaN*        | **1.00 ± 0.15** | *NaN*                | 7 ± 6       |
| Repeated Temporal Values | 1.046     | **1.00 ± 0.10** | 1.09 ± 0.12     | 8.4 ± 0.6    | 5.1 ± 0.4    | 4.4 ± 0.8       | 5.5 ± 0.4            | 3.0 ± 0.4   |
| Mixed Extended Types     | 0.025     | **1.00 ± 0.12** | 1.08 ± 0.15     | 5.9 ± 0.6    | 6.0 ± 0.6    | 1.8 ± 0.2       | 3.1 ± 0.3            | 2.3 ± 0.2   |

### Bun - parse

| scenario                 | Best (ms) | powerjson v1    | powerjson v2    | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json  |
| ------------------------ | --------- | --------------- | --------------- | ------------ | ------------ | --------------- | -------------------- | ---------- |
| Realistic API Call       | 13.587    | 1.08 ± 0.11     | **1.00 ± 0.14** | 2.8 ± 0.3    | 2.5 ± 0.3    | 1.14 ± 0.12     | 4.1 ± 0.4            | 31 ± 3     |
| Small Payload Burst      | 6.068     | **1.00 ± 0.02** | 1.104 ± 0.019   | 1.57 ± 0.03  | 1.58 ± 0.09  | 1.85 ± 0.04     | 9.5 ± 0.2            | 24.3 ± 0.7 |
| Shared References        | 0.639     | 3.7 ± 0.4       | **1.00 ± 0.15** | 12.2 ± 1.5   | 3.2 ± 0.3    | 1.08 ± 0.12     | 12.7 ± 1.3           | 35 ± 4     |
| Circular References      | 0.007     | 3235 ± 222      | 2.1 ± 0.2       | 55 ± 10      | *NaN*        | **1.00 ± 0.09** | *NaN*                | 43 ± 6     |
| Repeated Temporal Values | 1.269     | **1.04 ± 0.17** | **1.0 ± 0.2**   | 6.2 ± 0.9    | 2.6 ± 0.4    | 1.09 ± 0.18     | 6.0 ± 0.9            | 42 ± 6     |
| Mixed Extended Types     | 0.025     | **1.01 ± 0.16** | **1.00 ± 0.16** | 2.3 ± 0.3    | 2.2 ± 0.3    | 1.16 ± 0.15     | 3.8 ± 0.5            | 10.8 ± 1.3 |

### Node - stringify

| scenario                 | Best (ms) | powerjson v1      | powerjson v2    | superjson v1 | superjson v2 | devalue       | serialize-javascript | next-json   |
| ------------------------ | --------- | ----------------- | --------------- | ------------ | ------------ | ------------- | -------------------- | ----------- |
| Realistic API Call       | 24.789    | **1.0 ± 0.4**     | 1.2 ± 0.4       | 3.9 ± 1.1    | 3.5 ± 0.9    | 1.5 ± 0.4     | 1.4 ± 0.4            | 1.6 ± 0.5   |
| Small Payload Burst      | 14.006    | **1.000 ± 0.006** | **1.03 ± 0.06** | 3.20 ± 0.05  | 3.11 ± 0.10  | 2.08 ± 0.18   | 1.60 ± 0.04          | 1.88 ± 0.12 |
| Shared References        | 1.636     | 2.3 ± 0.2         | **1.00 ± 0.03** | 5.01 ± 0.14  | 1.82 ± 0.07  | 1.11 ± 0.04   | 4.33 ± 0.14          | 1.08 ± 0.04 |
| Circular References      | 0.049     | 1080 ± 397        | 2.1 ± 1.0       | 11 ± 4       | *NaN*        | **1.0 ± 0.5** | *NaN*                | 3.2 ± 1.3   |
| Repeated Temporal Values | 2.635     | **1.00 ± 0.09**   | 1.07 ± 0.14     | 4.1 ± 0.3    | 1.90 ± 0.17  | 1.38 ± 0.12   | 2.18 ± 0.14          | 1.24 ± 0.09 |
| Mixed Extended Types     | 0.063     | **1.03 ± 0.07**   | **1.00 ± 0.07** | 2.54 ± 0.14  | 2.52 ± 0.14  | 1.11 ± 0.06   | 1.40 ± 0.08          | 1.36 ± 0.08 |

### Node - parse

| scenario                 | Best (ms) | powerjson v1 | powerjson v2 | superjson v1 | superjson v2 | devalue         | serialize-javascript | next-json  |
| ------------------------ | --------- | ------------ | ------------ | ------------ | ------------ | --------------- | -------------------- | ---------- |
| Realistic API Call       | 17.133    | 1.57 ± 0.14  | 1.5 ± 0.3    | 2.5 ± 0.5    | 2.7 ± 0.7    | **1.00 ± 0.12** | 3.1 ± 0.3            | 26 ± 2     |
| Small Payload Burst      | 13.542    | 1.16 ± 0.09  | 1.17 ± 0.11  | 1.40 ± 0.10  | 1.38 ± 0.07  | **1.00 ± 0.07** | 1.29 ± 0.08          | 12.1 ± 0.6 |
| Shared References        | 0.617     | 7.0 ± 0.4    | 2.19 ± 0.06  | 11.9 ± 0.3   | 2.59 ± 0.06  | **1.00 ± 0.02** | 9 ± 5                | 41.5 ± 0.8 |
| Circular References      | 0.062     | 967 ± 218    | 1.3 ± 0.5    | 9.5 ± 1.5    | *NaN*        | **1.00 ± 0.19** | *NaN*                | 15 ± 4     |
| Repeated Temporal Values | 1.025     | 2.93 ± 0.18  | 2.9 ± 0.2    | 6.9 ± 0.4    | 2.25 ± 0.15  | **1.00 ± 0.07** | 2.90 ± 0.16          | 51 ± 3     |
| Mixed Extended Types     | 0.030     | 1.96 ± 0.14  | 1.94 ± 0.14  | 2.43 ± 0.14  | 2.41 ± 0.13  | 1.34 ± 0.08     | **1.00 ± 0.06**      | 13.0 ± 0.6 |

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
