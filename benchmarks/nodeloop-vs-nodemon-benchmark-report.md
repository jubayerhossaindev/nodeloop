# Nodeloop vs Nodemon

## Comprehensive Performance Benchmark Report

> **Benchmark result:** Nodeloop leads in startup time, memory footprint, average CPU usage, process count, and thread count. Nodemon is currently faster at detecting a file change and completing the resulting restart.

**Report date:** 4 November 2026
**Benchmark timestamp:** `2026-11-04T13:01:39.668Z`
**Report scope:** The exact Linux Codespaces run supplied with this report
**Benchmark runs:** 5 paired runs per tool
**File-watcher tests:** 15 attempts per tool

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. At-a-Glance Scorecard](#2-at-a-glance-scorecard)
- [3. Detailed Results](#3-detailed-results)
- [4. Reliability and File-Watcher Results](#4-reliability-and-file-watcher-results)
- [5. Test Environment](#5-test-environment)
- [6. Benchmark Configuration](#6-benchmark-configuration)
- [7. Detailed Statistics and Raw Samples](#7-detailed-statistics-and-raw-samples)
- [8. Interpretation and Limitations](#8-interpretation-and-limitations)
- [9. Final Verdict](#9-final-verdict)
- [10. Suggested Next Steps](#10-suggested-next-steps)
- [11. Reproduction](#11-reproduction)

---

## 1. Executive Summary

The benchmark completed successfully for both tools. All benchmark phases ran, both tools passed every file-change restart attempt, neither tool produced unexpected restarts during the no-change observation window, and both completed all graceful-shutdown tests without forced cleanup.

### Headline results

| Area                      |       Nodeloop |       Nodemon | Result                              |
| ------------------------- | -------------: | ------------: | ----------------------------------- |
| App ready / startup       |   **99.26 ms** |     185.01 ms | Nodeloop is 46.35% lower            |
| Idle RSS                  | **59,916 KiB** |   113,520 KiB | Nodeloop is 47.22% lower            |
| Peak PSS                  | **24,344 KiB** |    43,534 KiB | Nodeloop is 44.07% lower            |
| Peak USS                  | **14,380 KiB** |    29,256 KiB | Nodeloop is 50.86% lower            |
| Average CPU (one core)    |      **6.38%** |        14.93% | Nodeloop is 57.27% lower            |
| Peak process count        |          **1** |             3 | Nodeloop uses fewer processes       |
| Peak thread count         |         **12** |            18 | Nodeloop uses fewer threads         |
| Graceful shutdown         |  **218.94 ms** |     221.60 ms | Very close; Nodeloop is 1.20% lower |
| Restart after file change |      300.21 ms | **262.47 ms** | Nodemon is 37.74 ms faster          |
| Restart success rate      |       **100%** |      **100%** | Tie                                 |
| Unexpected restarts       |          **0** |         **0** | Tie                                 |

### Overall reading

Nodeloop shows a strong advantage in the measured startup and resource-use metrics. The largest relative advantage is average CPU usage, followed by USS memory. Nodemon's clear win in this run is file-change restart latency: its median is 262.47 ms compared with Nodeloop's 300.21 ms.

> This is a benchmark result for the tested environment and configuration—not proof that either tool will have identical results on every operating system, machine, project, or watch configuration.

---

## 2. At-a-Glance Scorecard

**How to read the ratio:** `Nodeloop / Nodemon`. For time and resource metrics, a ratio below `1.000` means Nodeloop used less time or fewer resources. A ratio above `1.000` means Nodemon had the lower value. For success rate, higher is better. The swap ratio is `1.000` because both tools recorded zero swap usage.

| Metric                    |   Nodeloop |     Nodemon |   NL / ND | Better result      |
| ------------------------- | ---------: | ----------: | --------: | ------------------ |
| App ready / startup       |   99.26 ms |   185.01 ms | **0.537** | Nodeloop           |
| Idle RSS                  | 59,916 KiB | 113,520 KiB | **0.528** | Nodeloop           |
| Peak RSS                  | 59,916 KiB | 113,520 KiB | **0.528** | Nodeloop           |
| Peak PSS                  | 24,344 KiB |  43,534 KiB |     0.559 | Nodeloop           |
| Peak USS                  | 14,380 KiB |  29,256 KiB |     0.492 | Nodeloop           |
| Average CPU (one core)    |      6.38% |      14.93% | **0.427** | Nodeloop           |
| Peak sampled CPU          |     64.67% |     118.32% |     0.547 | Nodeloop           |
| Idle CPU (one core)       |      5.88% |       4.54% |     1.295 | Nodemon            |
| Process-tree CPU time     |      70 ms |      180 ms |     0.389 | Nodeloop           |
| Peak process count        |          1 |           3 |     0.333 | Nodeloop           |
| Peak thread count         |         12 |          18 |     0.667 | Nodeloop           |
| Peak swap                 |      0 KiB |       0 KiB |     1.000 | Tie                |
| Graceful shutdown         |  218.94 ms |   221.60 ms |     0.988 | Nodeloop, narrowly |
| Restart after file change |  300.21 ms |   262.47 ms |     1.144 | Nodemon            |
| Startup with 100 files    |  101.77 ms |   184.86 ms |     0.551 | Nodeloop           |
| Startup with 500 files    |   97.97 ms |   185.66 ms |     0.528 | Nodeloop           |
| Startup with 1,000 files  |  100.13 ms |   182.49 ms |     0.549 | Nodeloop           |

### Relative differences

| Comparison                      |         Difference in this run |
| ------------------------------- | -----------------------------: |
| Nodeloop startup time           |  **46.35% lower** than Nodemon |
| Nodeloop idle / peak RSS        |  **47.22% lower** than Nodemon |
| Nodeloop peak PSS               |  **44.07% lower** than Nodemon |
| Nodeloop peak USS               |  **50.86% lower** than Nodemon |
| Nodeloop average CPU            |  **57.27% lower** than Nodemon |
| Nodeloop process-tree CPU time  |  **61.11% lower** than Nodemon |
| Nodeloop graceful-shutdown time |   **1.20% lower** than Nodemon |
| Nodeloop restart latency        | **14.38% higher** than Nodemon |
| Nodeloop idle CPU               | **29.52% higher** than Nodemon |

Percentages compare the reported medians. “Lower” describes the measured value; it does not automatically mean a statistically significant or universally repeatable improvement.

---

## 3. Detailed Results

### 3.1 Startup performance

| Statistic             |     Nodeloop |   Nodemon |
| --------------------- | -----------: | --------: |
| Median app-ready time | **99.26 ms** | 185.01 ms |
| Minimum               |     95.09 ms | 165.84 ms |
| Maximum               |    153.20 ms | 313.55 ms |
| Mean                  |    109.03 ms | 209.94 ms |

Nodeloop's median app-ready time was 99.26 ms. Nodemon's was 185.01 ms. The median comparison gives Nodeloop a `0.537` Nodeloop-to-Nodemon ratio, or approximately `1.864×` the startup speed when comparing the reciprocal of the two times.

The timing definition is **from the `spawn()` call until the target application prints its unique `READY` marker**. It is not simply the time required to start the CLI process.

### 3.2 Memory footprint

| Memory metric      |       Nodeloop |        Nodemon | Nodeloop reduction |
| ------------------ | -------------: | -------------: | -----------------: |
| Idle RSS           | **59,916 KiB** |    113,520 KiB |             47.22% |
| Peak RSS           | **59,916 KiB** |    113,520 KiB |             47.22% |
| Peak PSS           | **24,344 KiB** |     43,534 KiB |             44.08% |
| Peak USS           | **14,380 KiB** |     29,256 KiB |             50.85% |
| Median average RSS | **56,898 KiB** | 102,729.85 KiB |             44.61% |
| Peak swap          |          0 KiB |          0 KiB |              Equal |

**RSS (Resident Set Size)** is the resident memory mapped into a process. It can count shared pages in more than one process, so adding RSS across a process tree can overstate physical memory use.

**PSS (Proportional Set Size)** apportions shared pages among the processes that share them. It is often a more useful aggregate comparison for a process tree.

**USS (Unique Set Size)** represents memory unique to a process rather than shared with other processes. In this run, Nodeloop's peak USS was approximately half Nodemon's.

Both tools reported `0 KiB` swap in every recorded sample. This is a valid zero measurement in this run, not a missing metric. The `1.000` ratio represents equality.

### 3.3 CPU usage

| CPU metric             |   Nodeloop |   Nodemon | Interpretation |
| ---------------------- | ---------: | --------: | -------------- |
| Average CPU (one core) |  **6.38%** |    14.93% | Nodeloop lower |
| Peak sampled CPU       | **64.67%** |   118.32% | Nodeloop lower |
| Idle CPU (one core)    |      5.88% | **4.54%** | Nodemon lower  |
| Process-tree CPU time  |  **70 ms** |    180 ms | Nodeloop lower |

CPU percentages are expressed relative to one logical CPU core. A process tree can exceed 100% when its processes use more than one core at the same time. The reported peak CPU is sampled at 100 ms intervals, so very short spikes may not be captured.

Nodeloop had lower average CPU and lower total process-tree CPU time in this run. However, Nodemon's idle CPU median was lower: 4.54% compared with Nodeloop's 5.88%. This is a small but real counter-result and should not be hidden.

### 3.4 Process and thread counts

| Metric                    | Nodeloop | Nodemon |
| ------------------------- | -------: | ------: |
| Median peak process count |    **1** |       3 |
| Median peak thread count  |   **12** |      18 |

The process-count result is especially notable: Nodeloop's measured process tree peaked at one process, while Nodemon's median was three. This describes the process trees observed by this benchmark; it does not imply that Nodemon always uses exactly three processes in every environment or configuration.

### 3.5 Graceful shutdown

| Statistic                                |         Nodeloop |          Nodemon |
| ---------------------------------------- | ---------------: | ---------------: |
| Median shutdown time                     |    **218.94 ms** |        221.60 ms |
| Successful graceful shutdowns            |              5/5 |              5/5 |
| Forced cleanup count                     |                0 |                0 |
| Processes remaining before force cleanup | 0 in all samples | 0 in all samples |
| Shutdown errors                          |                0 |                0 |

Both tools completed all five shutdown tests successfully, required no forced cleanup, and left no detected processes before force cleanup. Their median shutdown times were very close; Nodeloop was 2.66 ms lower.

### 3.6 Startup with pre-existing files

The configured file counts represent **extra pre-existing fixture files**. `app.js` and `watched.js` are additional control files, so the total number of fixture files is greater than the number shown in the table.

| Extra files | Nodeloop median | Nodemon median | Nodeloop reduction |
| ----------: | --------------: | -------------: | -----------------: |
|         100 |   **101.77 ms** |      184.86 ms |             44.95% |
|         500 |    **97.97 ms** |      185.66 ms |             47.23% |
|       1,000 |   **100.13 ms** |      182.49 ms |             45.13% |

Within these tested fixture sizes, Nodeloop's median startup time stayed close to 100 ms. Nodemon's median stayed around 182–186 ms. These results do not establish how either tool scales to arbitrarily large repositories or different filesystem layouts.

---

## 4. Reliability and File-Watcher Results

### 4.1 Restart success

<details>
<summary><strong>Restart test scorecard — expand details</strong></summary>

| Metric                        |  Nodeloop |       Nodemon |
| ----------------------------- | --------: | ------------: |
| Attempts                      |        15 |            15 |
| Successful restarts           |    **15** |        **15** |
| Failed restarts               |         0 |             0 |
| Success rate                  |  **100%** |      **100%** |
| Median restart latency        | 300.21 ms | **262.47 ms** |
| Minimum latency               | 251.28 ms |     256.93 ms |
| Maximum latency               | 314.68 ms |     287.61 ms |
| Mean latency                  | 286.51 ms |     264.98 ms |
| Unexpected restarts           |         0 |             0 |
| Runs with unexpected restarts |         0 |             0 |
| Restart errors                |         0 |             0 |

</details>

Both tools detected all 15 file changes and successfully restarted the target application. Neither tool produced an unexpected `READY` marker during the no-change observation window.

### 4.2 Restart latency comparison

| Statistic          |  Nodeloop |       Nodemon |
| ------------------ | --------: | ------------: |
| Minimum            | 251.28 ms |     256.93 ms |
| Median             | 300.21 ms | **262.47 ms** |
| Mean               | 286.51 ms | **264.98 ms** |
| Maximum            | 314.68 ms | **287.61 ms** |
| Standard deviation |  23.67 ms |       7.42 ms |

Nodemon's median restart latency was 37.74 ms lower. Relative to Nodemon's median, Nodeloop's restart latency was approximately 14.38% higher. Nodeloop also showed a wider spread in these 15 latency observations (23.67 ms standard deviation versus 7.42 ms).

**Interpretation:** Nodeloop's file watcher is working reliably in this test, but restart responsiveness is the clearest performance area where Nodemon currently leads.

### 4.3 What the restart test measures

The benchmark definition is:

> Elapsed time from writing `watched.js` to the next target-application `READY` marker.

This includes the observed file-change-to-restart path and the target application's time to become ready. It is not a pure filesystem notification latency measurement.

---

## 5. Test Environment

| Environment property      | Value                               |
| ------------------------- | ----------------------------------- |
| Node.js                   | `v24.22.2`                          |
| Platform                  | Linux                               |
| Kernel / OS release       | `6.8.0-1064-azure`                  |
| Architecture              | `x64`                               |
| CPU model                 | AMD EPYC 7763 64-Core Processor     |
| Logical CPU count         | 2                                   |
| Available CPU parallelism | 2                                   |
| Total memory              | 7.76 GiB                            |
| Free memory at start      | 3.34 GiB                            |
| Load average at start     | `3.19, 2.51, 1.71`                  |
| Process sampler           | Linux `/proc` process-group sampler |
| Sampling interval         | 100 ms                              |
| cgroup CPU quota          | Not reported (`null`)               |
| cgroup memory limit       | Not reported (`null`)               |
| cgroup memory current     | 0 GiB as reported by the benchmark  |

> **Environment note:** The CPU model string identifies the host CPU model; the benchmark reports only two logical CPUs available to this run. Results should therefore be understood in the context of the available two-CPU environment rather than the full physical capabilities implied by the CPU model name.

---

## 6. Benchmark Configuration

| Setting                         | Value                       |
| ------------------------------- | --------------------------- |
| Benchmark runs                  | 5                           |
| Restart attempts per run        | 3                           |
| Total restart attempts per tool | 15                          |
| File-count scenarios            | 100, 500, 1,000 extra files |
| Watcher delay                   | 200 ms                      |
| Idle observation window         | 1,000 ms                    |
| Watch settle period             | 500 ms                      |
| No-change observation window    | 750 ms                      |
| General timeout                 | 60,000 ms                   |
| Watch timeout                   | 15,000 ms                   |
| Shutdown timeout                | 8,000 ms                    |
| Process sampling interval       | 100 ms                      |

### CLI paths

| Tool     | CLI path                              |
| -------- | ------------------------------------- |
| Nodeloop | `packages/nodeloop/dist/cli.js`       |
| Nodemon  | `node_modules/nodemon/bin/nodemon.js` |

### Arguments used

#### Nodeloop

```text
-d 200 -w <fixture> app.js
```

#### Nodemon

```text
--delay 0.2 --watch <fixture> app.js
```

The benchmark configuration report records `<fixture>` as a placeholder for the per-test fixture path. In the restart test, the updated benchmark watches the specific `watched.js` fixture file.

### Execution order

Runs were paired sequentially, with tool order alternating each run to reduce systematic order bias. This helps reduce—but does not eliminate—effects from machine load, filesystem cache, and other environmental variation.
|

### Statistical terms

- **Minimum / Maximum:** Lowest and highest observed samples.
- **Mean:** Arithmetic average of the samples.
- **Median:** Middle value after sorting the samples. This report uses medians for the headline comparisons.
- **Standard deviation:** A measure of spread across the samples.
- **P95 / P99:** Reported 95th and 99th percentile values. With only five samples in many sections, these percentiles are highly sample-limited and often equal the maximum.
- **Ratio:** Nodeloop's reported median divided by Nodemon's reported median. A lower ratio is better for elapsed-time and resource metrics.

---

## 7. Detailed Statistics and Raw Samples

The tables below preserve the statistics and sample arrays present in the supplied benchmark JSON. Values are copied as reported. `SD` means standard deviation; `P95` and `P99` are the reported percentiles.

### 7.5 Sampler and sample counts

| Property               | Nodeloop                      | Nodemon                       |
| ---------------------- | ----------------------------- | ----------------------------- |
| Sampling supported     | Yes                           | Yes                           |
| Sampler method         | `/proc` process-group sampler | `/proc` process-group sampler |
| Sampling interval      | 100 ms                        | 100 ms                        |
| Startup samples        | 5                             | 5                             |
| Shutdown samples       | 5                             | 5                             |
| Restart benchmark runs | 5                             | 5                             |
| Restart attempts       | 15                            | 15                            |

---

## 8. Interpretation and Limitations

### What this run demonstrates

1. **Startup:** Nodeloop reached the application's `READY` marker substantially sooner in this configuration.
2. **Memory:** Nodeloop's reported RSS, PSS, and USS medians were lower in this process-tree measurement.
3. **CPU:** Nodeloop used less average CPU and accumulated less process-tree CPU time in this run.
4. **Process footprint:** Nodeloop had a lower observed process and thread count.
5. **Shutdown:** Both tools shut down cleanly in all five tests.
6. **Watcher correctness:** Both tools detected all 15 file changes and had zero observed unexpected restarts.
7. **Restart responsiveness:** Nodemon completed the measured file-change-to-`READY` cycle sooner.

### Important caveats

- **One environment:** These measurements are from one Linux Codespaces environment. Windows, macOS, local Linux, different filesystems, and different Node.js builds may produce different results.
- **Five benchmark runs:** Five paired runs are useful for an initial comparison, but a larger number of runs would provide a stronger basis for conclusions—especially for tail latency and noisy metrics.
- **Not a cold-cache guarantee:** The benchmark is a fresh-process launch benchmark, not proof of a cold operating-system filesystem cache.
- **Sampled peak CPU:** CPU sampling occurs every 100 ms and can miss very short spikes.
- **PSS / USS platform support:** These measurements are available in this Linux run. Other platforms may not expose equivalent values through the same sampler.
- **RSS and shared pages:** RSS can count shared pages more than once across processes. PSS is a better shared-memory-adjusted view where available.
- **Fixture scope:** The file-count scenarios use generated fixture files. They do not represent every real-world project structure, ignore rule, symlink layout, or dependency tree.
- **Restart timing includes application readiness:** Restart latency ends at the target application's next `READY` marker, so it includes more than just filesystem event delivery.
- **CPU percentages can exceed 100%:** Values are relative to one logical core and may exceed 100% when multiple processes execute concurrently.
- **Cgroup fields:** The benchmark reported CPU quota and memory limit as `null`; do not infer that the Codespaces container had unlimited host resources.

### Avoid these unsupported conclusions

This run does **not** prove that Nodeloop is faster in every possible workload, that it is universally more stable than Nodemon, or that the same ratios will appear on Windows/macOS. It also does not establish performance for every project size or watcher configuration.

---

## 9. Final Verdict

### Nodeloop's current strengths

- Faster measured application startup.
- Lower measured memory footprint across RSS, PSS, and USS.
- Lower measured average CPU usage and process-tree CPU time.
- Fewer observed processes and threads.
- Clean graceful shutdown in every test.
- 100% file-change restart success in this benchmark.
- Zero unexpected restarts during the no-change observation windows.

### Current area where Nodemon leads

- Lower median file-change restart latency: **262.47 ms** versus **300.21 ms**.
- Lower median idle CPU: **4.54%** versus **5.88%**.

### Balanced conclusion

**Nodeloop is already highly competitive with Nodemon in this benchmark and has a clear measured advantage in several important startup and resource-efficiency metrics.** It is not accurate to say Nodeloop wins every metric: Nodemon currently leads in restart latency and idle CPU. Both tools achieved 100% restart success and clean shutdowns in the tested runs.

> The most reasonable product decision is to preserve the current working implementation as a baseline, continue normal development, and revisit watcher/restart optimization later. Avoid destabilizing working features solely to chase a small benchmark gap before profiling the watcher path.

---

## 10. Suggested Next Steps

These are recommendations, not claims that the benchmark has already performed them.

1. **Keep this run as a baseline.** Preserve the JSON output alongside this Markdown report so future measurements can be compared with the same configuration.
2. **Do not optimize blindly.** When returning to performance work, profile the file-change-to-`READY` path and identify where Nodeloop spends the extra time.
3. **Increase repetitions for release claims.** Consider 20–30 paired runs, multiple fresh sessions, and repeated runs on Windows, Linux, and macOS before publishing broad performance claims.
4. **Add representative projects.** Test a small project, a medium project, and a large repository with realistic ignore patterns and nested directories.
5. **Keep correctness gates.** Any optimization must retain 100% restart success, zero unexpected restarts, and clean process shutdown.
6. **Track regressions.** Keep the current medians as a reference and compare future releases using the same Node version, fixture setup, delay, and sampler settings.

---

## 11. Reproduction

Run the benchmark from the repository root in the same prepared environment:

```bash
node benchmarks/nodemon-vs-nodeloop-benchmark.ts
```

The supplied run wrote its JSON report to:

```text
benchmarks/results/nodemon-vs-nodeloop.json
```

### Report provenance

This Markdown report was prepared from the benchmark console output and JSON report supplied by the project owner in the conversation. It preserves the reported measurements and includes interpretation of the results. It does not claim to have independently rerun the benchmark.

---

<div align="center">

**Nodeloop — Lightweight. Fast startup. Efficient resource usage.**
Benchmark snapshot · 4 November 2026 · Linux / Node.js v24.22.2

</div>
