import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { printWarning } from './utils.ts';

/**
 * Builds the argv for running `executable args` pinned to a single CPU core via `taskset`,
 * which greatly reduces benchmark noise caused by the OS scheduler migrating the process between cores
 * (each with its own cache state and, on hybrid CPUs, different performance characteristics).
 *
 * Also tries to maximize the process's priority via `nice`, which can reduce noise from other processes competing for CPU time.
 */
export function buildPinnedCommand(executable: string, args: string[]): string[] {
    let output = [ executable, ...args ];

    const cpu = getValidCpu();
    if (cpu)
        output = [ 'taskset', '--cpu-list', cpu, ...output ];

    if (isNiceAvailable())
        output = [ 'nice', '-n', '-20', ...output ];

    return output;
}

function getValidCpu(): string | undefined {
    if (process.platform !== 'linux') {
        printWarning('CPU pinning is only implemented for Linux.');
        return undefined;
    }

    const allowedCpus = getAllowedCpuList();
    if (!allowedCpus) {
        printWarning('Could not determine the CPUs allowed for this process (failed to read /proc/self/status).');
        return undefined;
    }

    // Respect container/cgroup restrictions; BENCHMARK_CPU can select another allowed CPU explicitly.
    const cpu = process.env.BENCHMARK_CPU ?? allowedCpus.split(/[-,]/)[0]!;

    const probe = spawnSync('taskset', [ '--cpu-list', cpu, 'true' ]);
    if (probe.status !== 0) {
        printWarning(`CPU ${cpu} is not available (allowed: ${allowedCpus}), or 'taskset' is not installed.`);
        return undefined;
    }

    console.log(`Benchmark pinned to CPU ${cpu} (allowed: ${allowedCpus}).`);
    return cpu;
}

function getAllowedCpuList(): string | undefined {
    try {
        const status = readFileSync('/proc/self/status', 'utf8');
        return /^Cpus_allowed_list:\s*(\S+)/m.exec(status)?.[1];
    }
    catch {
        return undefined;
    }
}

function isNiceAvailable(): boolean {
    if (process.platform !== 'linux') {
        printWarning('Nice priority adjustment is only implemented for Linux.');
        return false;
    }

    const probe = spawnSync('nice', [ '-n', '-20', 'true' ]);
    if (probe.status !== 0) {
        printWarning('Nice priority adjustment is not available (is the "nice" command installed?).');
        return false;
    }

    if (/permission denied/i.test(probe.stderr.toString())) {
        printWarning('Nice priority adjustment is not available (requires root privileges).');
        return false;
    }

    console.log('Nice priority adjustment is available.');
    return true;
}
