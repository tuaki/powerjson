import { faker } from '@faker-js/faker';
import type { Scenario } from '../utils.ts';

export function sharedReferencesScenario(): Scenario {
    return {
        id: 'shared-references',
        name: 'Shared References',
        description: 'A JSON-compatible graph with many repeated object and array references but no cycles.',
        iterations: 200,
        batches: 10,
        getData: createSharedReferencesGraph,
    };
}

type SharedReferencesGraph = {
    records: {
        id: string;
        sharedProfile: Profile;
        sharedTags: string[];
    }[];
    sharedProfile: Profile;
    sharedTags: string[];
};

type Profile = {
    id: string;
    name: string;
    role: string;
    email: string;
    department: string;
    region: string;
    timezone: string;
    joinedAt: Date;
    lastActiveAt: Date;
};

function createSharedReferencesGraph(): SharedReferencesGraph {
    const sharedProfile = {
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        role: faker.person.jobTitle(),
        email: faker.internet.email(),
        department: faker.commerce.department(),
        region: faker.location.countryCode('alpha-2'),
        timezone: faker.location.timeZone(),
        joinedAt: faker.date.past({ years: 8 }),
        lastActiveAt: faker.date.recent({ days: 30 }),
    };
    const sharedTags = [ 'priority', 'shared', 'benchmark' ];

    return {
        records: Array.from({ length: 1200 }, () => ({
            id: faker.string.uuid(),
            sharedProfile,
            sharedTags,
        })),
        sharedProfile,
        sharedTags,
    };
}
