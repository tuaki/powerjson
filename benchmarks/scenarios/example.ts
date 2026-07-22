import { type Scenario } from '../measure.js';
import { createRealisticApiCall } from './realisticApiCall.js';

export function exampleScenario(): Scenario {
    return {
        id: 'example',
        name: 'Example',
        description: 'A compact JSON-compatible payload used only to quickly validate that the benchmark harness works.',
        iterations: 10,
        getData: createRealisticApiCall,
    };
}
