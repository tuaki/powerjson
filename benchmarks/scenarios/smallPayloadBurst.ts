import { faker } from '@faker-js/faker';
import type { Scenario } from '../measure.js';

export function smallPayloadBurstScenario(): Scenario {
    return {
        id: 'small-payload-burst',
        name: 'Small Payload Burst',
        description: 'Many small realistic event payloads, measured as repeated per-item serialization and parsing.',
        iterations: 100,
        getData: createSmallPayloadBursts,
    };
}

type SmallPayload = {
    id: string;
    eventType: string;
    actorId: string;
    createdAt: Date;
    metadata: {
        route: string;
        source: string;
        attempt: number;
        success: boolean;
    };
};

function createSmallPayloadBursts(): SmallPayload[] {
    return Array.from({ length: 5000 }, () => ({
        id: faker.string.uuid(),
        eventType: faker.helpers.arrayElement([ 'click', 'view', 'submit', 'dismiss' ]),
        actorId: faker.string.uuid(),
        createdAt: faker.date.recent({ days: 2 }),
        metadata: {
            route: faker.helpers.arrayElement([ '/home', '/search', '/checkout', '/profile' ]),
            source: faker.helpers.arrayElement([ 'web', 'mobile', 'email', 'api' ]),
            attempt: faker.number.int({ min: 1, max: 3 }),
            success: faker.datatype.boolean(),
        },
    }));
}
