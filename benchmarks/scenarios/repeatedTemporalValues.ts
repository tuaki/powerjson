import { faker } from '@faker-js/faker';
import type { Scenario } from '../measure.js';

export function repeatedTemporalValuesScenario(): Scenario {
    return {
        id: 'repeated-temporal-values',
        name: 'Repeated Temporal Values',
        description: 'A realistic workload with many repeated Date and URL instances shared across entries.',
        iterations: 100,
        batches: 10,
        getData: createRepeatedTemporalValues,
    };
}

type RepeatedTemporalValues = {
    sharedDate: Date;
    sharedUrl: URL;
    entries: {
        id: string;
        generatedAt: Date;
        canonicalUrl: URL;
        label: string;
    }[];
};

function createRepeatedTemporalValues(): RepeatedTemporalValues {
    const sharedDate = faker.date.recent({ days: 7 });
    const sharedUrl = new URL('https://example.com/dashboard/reports?tab=weekly');

    return {
        sharedDate,
        sharedUrl,
        entries: Array.from({ length: 1800 }, () => ({
            id: faker.string.uuid(),
            generatedAt: sharedDate,
            canonicalUrl: sharedUrl,
            label: faker.company.catchPhrase(),
        })),
    };
}
