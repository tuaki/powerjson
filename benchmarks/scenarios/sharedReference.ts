import { faker } from '@faker-js/faker';
import { type Scenario } from '../measure.js';

export function sharedReferenceScenario(): Scenario {
    return {
        id: 'shared-reference',
        name: 'Shared Reference',
        description: 'A JSON-compatible graph with many repeated object and array references but no cycles.',
        iterations: 200,
        getData: createSharedReferenceGraph,
    };
}

type SharedReferenceGraph = {
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

function createSharedReferenceGraph(): SharedReferenceGraph {
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
