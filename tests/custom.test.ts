import { expect, test, describe } from 'bun:test';
import { Tester } from './utils.js';
import { DateTime } from 'luxon';
import { wrap } from './utils.js';
import { transformer } from '../src/transformers.ts';

class PrivateClass {
    #private: number;
    public: number;

    constructor(_private: number, _public: number) {
        this.#private = _private;
        this.public = _public;
    }

    get value() {
        return this.#private + this.public;
    }
}

test('ignores private properties', () => {
    const tester = Tester.createForAll();

    const input = new PrivateClass(1, 2);

    // Private properties are not enumerable, so they should be just ignored.
    tester.serialize({ input }, (serialized, serializer) => {
        const expected = Tester.addVersionToSerialized(serializer, {
            input: {
                public: 2,
            },
        });
        expect(serialized).toStrictEqual(expected);
    });
});

const dateTimeTransformer = transformer({
    clazz: DateTime,
    type: 'DateTime',
    serialize: value => value.toISO()!,
    deserialize: value => DateTime.fromISO(value, { setZone: true }),
    isEntity: false,
    isComposite: false,
});

test('Luxon DateTime to ISO string', () => {
    const tester = Tester.createForAll([ dateTimeTransformer ]);

    const input = DateTime.utc(2026, 8, 27, 12, 34, 56);
    const serialized = input.toISO()!;

    tester.serializeDeserialize({ input }, {
        $: { input: 'DateTime' },
        input: serialized,
    });

    tester.serializeDeserialize(input, wrap(serialized, 'DateTime'));
});

class SimpleDateTime {
    readonly iso: string;

    private constructor(iso: string) {
        this.iso = iso;
    }

    static create(iso: string): SimpleDateTime {
        return new SimpleDateTime(iso);
    }
}

const simpleDateTimeTransformer = transformer({
    clazz: SimpleDateTime,
    // Let's try a different name.
    type: 'SDT',
    serialize: value => value.iso,
    deserialize: value => SimpleDateTime.create(value),
    isEntity: false,
    isComposite: false,
});

test('class to primitive', () => {
    const tester = Tester.createForAll([ simpleDateTimeTransformer ]);

    const input = SimpleDateTime.create('Bazinga!');

    tester.serializeDeserialize({ input }, {
        $: { input: 'SDT' },
        input: 'Bazinga!',
    });

    tester.serializeDeserialize(input, wrap('Bazinga!', 'SDT'));
});

class Point {
    readonly x: number;
    readonly y: number;
    readonly z?: number;

    constructor(x: number, y: number, z?: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

const pointTransformer = transformer({
    clazz: Point,
    type: 'Point',
    // This should test that we can leverage the build-in functions to correctly handle composite indexes.
    serialize: (value, serializer) => serializer.serializeArray([
        value.x,
        value.y,
        value.z,
    ]),
    deserialize: (value, deserializer) => {
        const [ x, y, z ] = deserializer.deserializeArray(value) as [ number, number, number | undefined ];
        return new Point(x, y, z);
    },
    isEntity: false,
    isComposite: true,
});

test('class to array', () => {
    const tester = Tester.createForAll([ pointTransformer ]);

    const input = [
        new Point(6, 9),
        new Point(4, 2, 0),
    ];

    tester.serializeDeserialize({ input }, {
        $: { input: { 1: 'Point', 4: 'undefined', 5: 'Point' } },
        input: [
            [ 6, 9, null ],
            [ 4, 2, 0 ],
        ],
    });
});

class Author {
    readonly name: string;

    constructor(name: string) {
        this.name = name;
    }
}

const authorTransformer = transformer({
    clazz: Author,
    type: 'Author',
    // Let's try direct serialization.
    // This is generally not recommended because it can lead to issues on so many levels.
    // But anything is possible if you are brave enough.
    serialize: value => ({ name: value.name }),
    // For example, this breaks references!
    // Even though the serialization process will set the reference, there is no way how to access it here.
    // So, don't do this!
    // The internal API might be exposed in the future if a really good use case is found, but for now, it remains closed.
    deserialize: value => new Author((value as { name: string }).name),
    isEntity: false,
    isComposite: false,
});

class Comment {
    readonly author: Author;
    readonly content: string;
    readonly createdAt: Date;
    readonly responses?: Comment[];

    constructor(author: Author, content: string, createdAt: Date, responses?: Comment[]) {
        this.author = author;
        this.content = content;
        this.createdAt = createdAt;
        this.responses = responses;
    }
}

const commentTransformer = transformer({
    clazz: Comment,
    type: 'Comment',
    // This is kinda complex, so we use the built-in object functions.
    // We could copy the object like this instead of casting it:
    // serializer.serializePlainObject({
    //     author: value.author,
    //     content: value.content,
    //     createdAt: value.createdAt,
    //     responses: value.responses,
    // })
    // However, since we know that the object is just a plain object without any extra properties, we might as well save some work.
    // Although this is probably not the best idea in general - for finer control, the explicit copying is better.
    serialize: (value, serializer) => serializer.serializePlainObject(value as unknown as Record<string, unknown>),
    deserialize: (value, deserializer) => {
        const object = deserializer.deserializePlainObject(value) as {
            author: Author;
            content: string;
            createdAt: Date;
            responses?: Comment[];
        };

        return new Comment(object.author, object.content, object.createdAt, object.responses);
    },
    isEntity: false,
    isComposite: false,
});

test('recursively nested classes', () => {
    const tester = Tester.createForAll([ authorTransformer, commentTransformer ]);

    const alice = new Author('Alice');
    const bob = new Author('Bob');
    const charlie = new Author('Charlie');
    const eve = new Author('Eve');

    const input = new Comment(alice, 'Root comment', new Date('2001-01-01T00:00:00.000Z'), [
        new Comment(eve, 'First reply', new Date('2002-02-02T00:00:00.000Z'), [
            // No responses to this one.
        ]),
        new Comment(bob, 'Second reply', new Date('2003-03-03T00:00:00.000Z'), [
            new Comment(charlie, 'Nested reply', new Date('2004-04-04T00:00:00.000Z')),
            // Also not here but we use undefined for that.
        ]),
    ]);

    // We skip the first deserialization test because it would be literally the same thing except for the one reference (which is not the focus here).
    tester.serializeDeserialize({ input }, {
        $: {
            input: 'Comment',
        },
        input: {
            $: {
                author: 'Author',
                createdAt: 'Date',
                responses: { 1: 'Comment', 2: 'Comment' },
            },
            author: {
                name: 'Alice',
            },
            content: 'Root comment',
            createdAt: '2001-01-01T00:00:00.000Z',
            responses: [ {
                $: {
                    author: 'Author',
                    createdAt: 'Date',
                },
                author: {
                    name: 'Eve',
                },
                content: 'First reply',
                createdAt: '2002-02-02T00:00:00.000Z',
                responses: [],
            }, {
                $: {
                    author: 'Author',
                    createdAt: 'Date',
                    responses: { 1: 'Comment' },
                },
                author: {
                    name: 'Bob',
                },
                content: 'Second reply',
                createdAt: '2003-03-03T00:00:00.000Z',
                responses: [ {
                    $: {
                        author: 'Author',
                        createdAt: 'Date',
                        responses: 'undefined',
                    },
                    author: {
                        name: 'Charlie',
                    },
                    content: 'Nested reply',
                    createdAt: '2004-04-04T00:00:00.000Z',
                    responses: null,
                } ],
            } ],
        },
    });
});

abstract class A {
    readonly id: number;

    protected constructor(id: number) {
        this.id = id;
    }
}

const aTransformer = transformer({
    clazz: A,
    type: 'A',
    serialize: value => ({ id: value.id }),
    deserialize: value => value as unknown as A,
    isEntity: false,
    isComposite: false,
});

class B extends A {
    readonly label: string;

    constructor(id: number, label: string) {
        super(id);
        this.label = label;
    }
}

class C extends B {
    readonly isActive: boolean;

    constructor(id: number, label: string, isActive: boolean) {
        super(id, label);
        this.isActive = isActive;
    }
}

const cTransformer = transformer({
    clazz: C,
    type: 'C',
    serialize: value => ({
        id: value.id,
        label: value.label,
        isActive: value.isActive,
    }),
    deserialize: value => {
        const object = value as { id: number, label: string, isActive: boolean };
        return new C(object.id, object.label, object.isActive);
    },
    isEntity: false,
    isComposite: false,
});

class D extends C {
    readonly extra: string;

    constructor(id: number, label: string, isActive: boolean, extra: string) {
        super(id, label, isActive);
        this.extra = extra;
    }
}

describe('complex inheritance', () => {
    const tester = Tester.createForAll([ aTransformer, cTransformer ]);

    test('prototype lookup falls back to base-class transformer', () => {
        const input = new B(7, 'base');

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                $: { input: 'A' },
                input: { id: 7 },
            });
            expect(serialized).toStrictEqual(expected);
        });

        tester.forEach(serializer => {
            const parsed = serializer.parse(serializer.stringify(input));
            // The type information is lost because of how the custom serializer is implemented.
            const expected = { id: 7 };

            expect(parsed).toStrictEqual(expected);
        });
    });

    test('prototype lookup prefers nearest transformer in inheritance chain', () => {
        const input = new D(42, 'nearest', false, 'extra');

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                $: { input: 'C' },
                input: {
                    id: 42,
                    label: 'nearest',
                    isActive: false,
                },
            });
            expect(serialized).toStrictEqual(expected);
        });

        tester.forEach(serializer => {
            const parsed = serializer.parse(serializer.stringify(input));
            // Again, some information is lost.
            const expected = new C(42, 'nearest', false);

            expect(parsed).toStrictEqual(expected);
        });
    });
});
