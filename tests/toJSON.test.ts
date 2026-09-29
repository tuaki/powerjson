import { expect, test, describe } from 'bun:test';
import { Tester, wrap } from './utils.ts';
import { transformer } from '../src/transformers.ts';

/** A not-registered class with a custom `toJSON` method. */
class Custom {
    constructor(
        public value: number,
    ) {}

    toJSON() {
        return this.value + 27;
    }
}

/** A registered class with a custom `toJSON` method and `useToJSON: true`. */
class Money {
    constructor(
        public integer: number,
    ) {}

    toJSON() {
        return `$${(this.integer / 100).toFixed(2)}`;
    }
}

const moneyTransformer = transformer({
    cls: Money,
    type: 'Money',
    serialize: value => value.integer,
    deserialize: value => new Money(value),
    useToJSON: true,
});

/** A registered class with a custom `toJSON` method and `useToJSON: false`. */
class Weight {
    constructor(
        public kg: number,
    ) {}

    toJSON() {
        return 'Is this your phone number?';
    }
}

const weightTransformer = transformer({
    cls: Weight,
    type: 'Weight',
    serialize: value => value.kg,
    deserialize: value => new Weight(value),
});

const tester = Tester.createForAll([ moneyTransformer, weightTransformer ]);

describe('toJSON on plain objects and arrays', () => {
    test('a class without its own transformer falls back to the object transformer, which uses toJSON', () => {
        const input = { custom: new Custom(42) };

        tester.serialize(input, {
            custom: 69,
        });
    });

    test('arrays also use toJSON when present', () => {
        const array = Object.assign([ 1, 2, 3 ], { toJSON: () => 'array-json' });

        tester.serialize({ array }, { array: 'array-json' });
    });

    test('a custom transformer can opt in to toJSON via `useToJSON`', () => {
        // No type annotation is added - `useToJSON` fully bypasses the transformer (including its type annotation), so all type information is lost, just like it would be for a plain object or array.
        tester.serialize({ input: new Money(1050) }, { input: '$10.50' });
    });

    test('toJSON is ignored for transformers that don\'t opt in via `useToJSON`', () => {
        tester.serializeDeserialize({ input: new Weight(500) }, {
            input: 500,
            $: { input: 'Weight' },
        });
    });

    test('toJSON is ignored for built-in transformers, even ones (like URL) with a native toJSON', () => {
        // `Date.prototype.toJSON` exists natively, so this specifically checks that our own `useToJSON` flag (not just the mere presence of a `toJSON` method) gates the behavior.
        const url = Object.assign(new URL('https://example.com/'), { toJSON: () => 'HIJACKED' });
        const set = Object.assign(new Set([ 1, 2 ]), { toJSON: () => 'HIJACKED' });

        tester.serialize({ url, set }, {
            url: 'https://example.com/',
            set: [ 1, 2 ],
            $: { url: 'URL', set: { 0: 'Set' } },
        });
    });

    test('a non-function `toJSON` property is treated as a regular property', () => {
        tester.serializeDeserialize({ weirdObject: { toJSON: 'not a function', value: 1 } }, {
            weirdObject: { toJSON: 'not a function', value: 1 },
        });
    });
});

describe('objects with prototype-pollution-unsafe keys', () => {
    test('an invalid key doesn\'t prevent serialization if toJSON is defined - the object\'s own keys are never read', () => {
        const input = { prototype: 'value', toJSON: () => 'safe' };
        tester.serialize({ input }, { input: 'safe' });
    });

    test('without toJSON, the same invalid key still throws', () => {
        tester.forEach(serializer => {
            const input = { prototype: 'value' };
            expect(() => serializer.serialize({ input })).toThrow(/prototype/);
        });
    });

    test('if the toJSON result itself contains an invalid key, it still throws', () => {
        tester.forEach(serializer => {
            const input = { toJSON: () => ({ prototype: 'value' }) };
            expect(() => serializer.serialize({ input })).toThrow(/prototype/);
        });
    });
});

describe('the result of toJSON', () => {
    test('is not given to toJSON again, even if it also defines one (matches JSON.stringify behavior)', () => {
        const inner = {
            toJSON: () => {
                throw new Error('should not be called');
            },
            value: 'inner value',
        };
        const outer = { toJSON: () => inner };

        // `inner.toJSON` is itself a function, so - like any other function-valued property - it's silently dropped rather than invoked.
        tester.serialize({ outer }, { outer: { value: 'inner value' } });
    });

    test('is still dispatched to a new transformer if it happens to be a recognized instance', () => {
        const date = new Date('2021-06-15T00:00:00.000Z');
        const wrapper = { toJSON: () => date };

        tester.serializeCallback({ wrapper }, (serialized, serializer) => {
            expect(serialized).toStrictEqual(Tester.addVersionToSerialized(serializer, {
                wrapper: '2021-06-15T00:00:00.000Z',
                $: { wrapper: 'Date' },
            }));

            const output = serializer.parse(JSON.stringify(serialized)) as { wrapper: Date };
            expect(output.wrapper).toBeInstanceOf(Date);
            expect(output.wrapper.toISOString()).toBe('2021-06-15T00:00:00.000Z');
        });
    });
});

describe('circular and shared references produced by toJSON', () => {
    test('the produced object can contain circular references within itself', () => {
        const produced: Record<string, unknown> = { name: 'produced' };
        produced.self = produced;
        const withToJson = { toJSON: () => produced };

        tester.serializeCallback({ withToJson }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, serializer.config.deduplicate ? {
                withToJson: {
                    name: 'produced',
                    self: 1,
                    $: { self: 'ref' },
                },
                $: { withToJson: 1 },
            } : {
                withToJson: {
                    name: 'produced',
                    self: 1,
                    $: { self: 'ref' },
                },
            });
            expect(serialized).toStrictEqual(expected);

            const output = serializer.parse<{ withToJson: typeof produced }>(JSON.stringify(serialized));
            expect(output.withToJson.self).toBe(output.withToJson);
        });
    });

    test('the produced object can be referentially equal to one of its own ancestors', () => {
        const parent: Record<string, unknown> = { name: 'parent' };
        parent.child = { toJSON: () => parent };

        tester.serializeCallback(parent, (serialized, serializer) => {
            expect(serialized).toStrictEqual(Tester.addVersionToSerialized(serializer, {
                name: 'parent',
                child: 0,
                $: { child: 'ref' },
            }));
            const output = serializer.parse(JSON.stringify(serialized)) as Record<string, unknown>;
            expect(output.child).toBe(output);
        });
    });

    test('two different values producing the same object', () => {
        const shared = { name: 'shared' };
        const a = { toJSON: () => shared };
        const b = { toJSON: () => shared };

        tester.serializeCallback({ a, b }, (serialized, serializer) => {
            const isDeduplicate = serializer.config.deduplicate;
            const expected = Tester.addVersionToSerialized(serializer, isDeduplicate ? {
                a: {
                    name: 'shared',
                },
                b: 1,
                $: { a: 1, b: 'ref' },
            } : {
                a: {
                    name: 'shared',
                },
                b: {
                    name: 'shared',
                },
            });
            expect(serialized).toStrictEqual(expected);

            const output = serializer.parse<{ a: typeof shared, b: typeof shared }>(JSON.stringify(serialized));
            expect(output.a).toStrictEqual(shared);

            if (isDeduplicate)
                expect(output.a).toBe(output.b);
            else
                expect(output.a).not.toBe(output.b);
        });
    });

    test('the same object appearing twice has its toJSON called independently each time - the *call* itself is never deduplicated', () => {
        let callCount = 1;
        const stateful = {
            toJSON: () => {
                callCount = (callCount + 1) % 2;
                return `call-${callCount}`;
            },
        };

        tester.serialize({ a: stateful, b: stateful }, {
            a: 'call-0',
            b: 'call-1',
        });
    });
});

describe('toJSON returning special primitive values', () => {
    test.each([
        [ undefined, null, 'undefined' ],
        [ NaN, 'NaN', 'number' ],
        [ 10n, '10', 'bigint' ],
    ])('toJSON returning %p is preserved (not omitted), matching normal %p handling', (value, expected, annotation) => {
        tester.serialize({ input: { toJSON: () => value } }, {
            input: expected,
            $: { input: annotation },
        });
    });
});

class KeyProbe {
    toJSON(key: string) {
        return key;
    }
}

class Pair {
    constructor(
        public a: number,
        public b: number,
    ) {}

    toJSON() {
        return 'PAIR_JSON';
    }
}

const pairTransformer = transformer({
    cls: Pair,
    type: 'Pair',
    serialize: (value, serializer) => serializer.serializeArray([ value.a, value.b ]),
    deserialize: (value, deserializer) => {
        const [ a, b ] = deserializer.deserializeArray(value) as [ number, number ];
        return new Pair(a, b);
    },
    isComposite: true,
    useToJSON: true,
});

describe('composite transformers combined with toJSON', () => {
    test('a Map (which has no useToJSON) combined with toJSON-defining entries keeps the composite index in sync', () => {
        const map = new Map([ [ new KeyProbe(), new KeyProbe() ] ]);

        tester.serialize({ map }, {
            map: [ [ '2', '3' ] ],
            $: { map: { 0: 'Map' } },
        });
    });

    test('`useToJSON` is checked before the `isComposite` reset, so a composite transformer with `useToJSON` never runs its own composite serialization', () => {

        Tester.createForAll([ pairTransformer ]).serialize({ input: new Pair(1, 2) }, { input: 'PAIR_JSON' });
    });
});

describe('the key argument passed to toJSON', () => {
    test('receives the property key for plain objects, and a flat composite index inside arrays', () => {
        const input = {
            top: new KeyProbe(),
            array: [ new KeyProbe(), new KeyProbe() ],
            // The counter is flat across nesting levels, so this inner probe continues where the outer array left off rather than restarting at 0.
            nested: [ [ new KeyProbe() ] ],
        };

        tester.serialize(input, {
            top: 'top',
            array: [ '1', '2' ],
            nested: [ [ '2' ] ],
        });
    });

    test('a root object does have its own toJSON called, with an empty string key', () => {
        const input = {
            toJSON: (key: string) => {
                if (key !== '')
                    throw new Error(`Expected empty string key, got "${key}"`);

                return {
                    value: 'root',
                };
            },
        };

        tester.serialize(input, { value: 'root' });
    });
});

class Registered {
    constructor(
        public abc: number,
    ) {}

    toJSON() {
        return { efg: this.abc };
    }
}

const registeredTransformer = transformer({
    cls: Registered,
    type: 'Registered',
    serialize: value => ({ xyz: value.abc }),
    deserialize: value => new Registered(value.xyz),
    useToJSON: true,
});

describe('toJSON on root objects', () => {
    test.each([
        [ new Money(1234), '$12.34', undefined ],
        [ { toJSON: () => new Money(5678) }, 5678, 'Money' ],
        [ { toJSON: () => [ 1, 2, 3 ] }, [ 1, 2, 3 ], undefined ],
        [ { toJSON: () => NaN }, 'NaN', 'number' ],
        [ { toJSON: () => undefined }, null, 'undefined' ],
    ])('a root object whose toJSON produces %p is wrapped (and annotated if needed)', (input, expected, annotation) => {
        tester.serialize(input, wrap(expected, annotation));
    });

    test.each([
        [ { value: 'a', toJSON: () => ({ value: 'b' }) }, { value: 'b' } ],
        [ Object.assign([ 1, 2, 3 ], { toJSON: () => ({ x: 1 }) }), { x: 1 } ],
        [ new Registered(5), { efg: 5 } ],
    ])('a root object %p whose toJSON produces a plain object is not wrapped', (input, expected) => {
        Tester.createForAll([ registeredTransformer ]).serialize(input, expected);
    });

    test('a plain-object root\'s toJSON result is not itself re-checked for toJSON', () => {
        const inner = {
            value: 'inner',
            toJSON: () => {
                throw new Error('should not be called');
            },
        };

        tester.serialize({ toJSON: () => inner }, { value: 'inner' });
    });
});
