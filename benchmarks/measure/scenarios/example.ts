import type { Scenario } from '../utils.ts';
import { createRealisticApiCall } from './realisticApiCall.ts';

export function exampleScenario(): Scenario {
    return {
        id: 'example',
        name: 'Example',
        description: 'A compact JSON-compatible payload used only to quickly validate that the benchmark works.',
        iterations: 10,
        batches: 2,
        getData: createRealisticApiCall,
    };
}
