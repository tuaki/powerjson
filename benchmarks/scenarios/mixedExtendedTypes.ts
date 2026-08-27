import { faker } from '@faker-js/faker';
import type { Scenario } from '../measure.js';

export function mixedExtendedTypesScenario(): Scenario {
    return {
        id: 'mixed-extended-types',
        name: 'Mixed Extended Types',
        description: 'A payload that mixes Map, Set, Date, URL, undefined values, numeric edge cases, and object-valued maps.',
        skipSerializers: [ 'JSON' ],
        iterations: 1000,
        batches: 100,
        getData: createMixedExtendedTypes,
    };
}

// Typed arrays are fundamentally broken in superJson, so we don't include them in the benchmark.
// They would singlehandedly skew the results and make it impossible to compare the other types in a meaningful way.


type MixedExtendedTypes = {
    generatedAt: Date;
    lookup: Map<string, Set<number>>;
    objectLookup: Map<string, LookupDetails>;
    homepage: URL;
    missingValue: undefined;
    numericEdges: {
        nan: number;
        positiveInfinity: number;
        negativeInfinity: number;
        undefinedNumber: number | undefined;
    };
    mixedList: (string | number | undefined)[];
    dateSet: Set<Date>;
    nested: {
        optionalLabel: string | undefined;
        optionalCount: number | undefined;
    };
};

type LookupDetails = {
    count: number;
    enabled: boolean;
    note: string | undefined;
    tags: Set<string>;
    createdAt: Date;
    updatedAt: Date;
};

function createMixedExtendedTypes(): MixedExtendedTypes {
    const mapSize = faker.number.int({ min: 4, max: 8 });

    return {
        generatedAt: faker.date.past({ years: 7 }),
        lookup: createLookupMap(mapSize),
        objectLookup: createObjectLookupMap(mapSize),
        homepage: new URL(faker.internet.url()),
        missingValue: undefined,
        numericEdges: {
            nan: Number.NaN,
            positiveInfinity: Number.POSITIVE_INFINITY,
            negativeInfinity: Number.NEGATIVE_INFINITY,
            undefinedNumber: maybeUndefined(() => faker.number.int({ min: 0, max: 1000 })),
        },
        mixedList: [
            randomKey(),
            undefined,
            faker.number.int({ min: 1, max: 500 }),
            Number.NaN,
            Number.POSITIVE_INFINITY,
            faker.lorem.word(),
        ],
        dateSet: createDateSet(faker.number.int({ min: 2, max: 10 })),
        nested: {
            optionalLabel: maybeUndefined(() => faker.lorem.words(faker.number.int({ min: 1, max: 3 }))),
            optionalCount: maybeUndefined(() => faker.number.int({ min: 0, max: 1000 })),
        },
    };
}

function createLookupMap(size: number): Map<string, Set<number>> {
    const map = new Map<string, Set<number>>();

    while (map.size < size)
        map.set(randomKey(), createNumberSet(faker.number.int({ min: 3, max: 7 })));


    return map;
}

function createObjectLookupMap(size: number): Map<string, LookupDetails> {
    const map = new Map<string, LookupDetails>();

    while (map.size < size) {
        const createdAt = faker.date.past({ years: 7 });

        map.set(randomKey(), {
            count: faker.number.int({ min: 1, max: 250 }),
            enabled: faker.datatype.boolean(),
            note: maybeUndefined(() => faker.lorem.sentence()),
            tags: new Set(faker.helpers.arrayElements(TAG_POOL, faker.number.int({ min: 1, max: 6 }))),
            createdAt,
            updatedAt: faker.date.between({ from: createdAt, to: faker.defaultRefDate() }),
        });
    }

    return map;
}

const TAG_POOL = [ 'featured', 'seasonal', 'legacy', 'priority', 'compact', 'expanded', 'cached', 'fresh', 'public', 'internal' ] as const;

function createNumberSet(size: number): Set<number> {
    const values = new Set<number>();

    while (values.size < size)
        values.add(faker.number.int({ min: 1, max: 500 }));


    return values;
}

function createDateSet(size: number): Set<Date> {
    const timestamps = new Set<number>();

    while (timestamps.size < size)
        timestamps.add(faker.date.past({ years: 7 }).getTime());

    return new Set(Array.from(timestamps, timestamp => new Date(timestamp)));
}

function randomKey(): string {
    return `${faker.word.adjective()}-${faker.word.noun()}-${faker.number.int({ min: 1, max: 999 })}`;
}

function maybeUndefined<T>(createValue: () => T): T | undefined {
    return faker.datatype.boolean() ? createValue() : undefined;
}
