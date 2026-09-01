import type { Scenario } from '../measure.ts';
import { createRealisticApiCall } from './realisticApiCall.ts';

export function exampleScenario(): Scenario {
    return {
        id: 'example',
        name: 'Example',
        description: 'A compact JSON-compatible payload used only to quickly validate that the benchmark harness works.',
        iterations: 10,
        getData: createRealisticApiCall,
    };
}
