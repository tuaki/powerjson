import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPinnedCommand } from './pin.ts';

type Runtime = 'bun' | 'node';

// One command per supported runtime, rather than just re-using whichever executable ran this script - that way the
// runtime-specific flags it needs (e.g. Node's `--expose-gc`, so `forceGc()` can actually force a GC cycle) are never missed.
const RUNTIME_COMMANDS: Record<Runtime, (mainScript: string) => string[]> = {
    bun: mainScript => [ 'bun', 'run', mainScript ],
    node: mainScript => [ 'node', '--expose-gc', mainScript ],
};

const mainScript = fileURLToPath(new URL('./main.ts', import.meta.url));

const [ runtime, forwardedArgs ] = parseArgs(process.argv.slice(2));
console.log(`Running benchmarks under ${runtime}.`);

const baseCommand = [ ...RUNTIME_COMMANDS[runtime](mainScript), ...forwardedArgs ];

const [ executable, ...args ] = buildPinnedCommand(baseCommand[0]!, baseCommand.slice(1));

const child = spawn(executable, args, { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

/** The first CLI argument selects the runtime (defaulting to whichever one is running this script); the rest are forwarded to main.ts. */
function parseArgs(argv: string[]): [Runtime, string[]] {
    const [ first, ...rest ] = argv;
    if (first === 'bun' || first === 'node')
        return [ first, rest ];

    return [ defaultRuntime(), argv ];
}

function defaultRuntime(): Runtime {
    return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'bun' : 'node';
}
