import { expect, test, describe } from 'bun:test';
import { testSerializeDeserialize } from './utils.js';
import { UberJson } from '../src/uberJson.js';
import SuperJson from 'superjson';

// TODO Deep reference equality tests.

describe('circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b = { name: 'b', a };
    a.b = b;

    test('2 objects, nested', () => {
        testSerializeDeserialize({ a }, {
            a: {
                name: 'a',
                b: {
                    $: { 'a': [ 'ref', 'a' ] },
                    name: 'b',
                    a: null,
                },
            },
        });
    });

    test('2 objects, root', () => {
        testSerializeDeserialize(a, {
            name: 'a',
            b: {
                $: { 'a': [ 'ref', '' ] },
                name: 'b',
                a: null,
            },
        });
    });

    const c: Record<string, unknown> = { name: 'c' };
    c.self = c;

    test('1 object, nested', () => {
        testSerializeDeserialize({ c }, {
            c: {
                $: { self: [ 'ref', 'c' ] },
                name: 'c',
                self: null,
            },
        });
    });

    test('1 object, root', () => {
        testSerializeDeserialize(c, {
            $: { self: [ 'ref', '' ] },
            name: 'c',
            self: null,
        });
    });


    test('2 arrays', () => {
        const x: unknown[] = [ 'x' ];
        const y = [ 'y', x ];
        x.push(y);

        testSerializeDeserialize({ x }, {
            $: { 'x.1.1': [ 'ref', 'x' ] },
            x: [
                'x',
                [ 'y', null ],
            ],
        });
    });


    test('1 array', () => {
        const z: unknown[] = [ 'z' ];
        z.push(z);

        testSerializeDeserialize({ z }, {
            $: { 'z.1': [ 'ref', 'z' ] },
            z: [
                'z',
                null,
            ],
        });
    });

    test('set', () => {
        const s = new Set();
        s.add(s);

        testSerializeDeserialize({ s }, {
            $: { s: 'Set', 's.0': [ 'ref', 's' ] },
            s: [
                null,
            ],
        });
    });

    test('map', () => {
        const m = new Map();
        m.set(m, m);

        testSerializeDeserialize({ m }, {
            $: { m: 'Map', 'm.0.0': [ 'ref', 'm' ], 'm.0.1': [ 'ref', 'm' ] },
            m: [
                [ null, null ],
            ],
        });
    });
});

describe('reference objects', () => {
    // Some bugs are only visible with reference objects.
    const uberJson = new UberJson({ deduplicate: true });
    const superJson = new SuperJson({ dedupe: true });

    test('string properties of arrays are omitted', () => {
        const a = { name: 'a' };
        const b = { name: 'b' };

        const array = [ 1 ];
        const objectAccess = array as object as Record<string, unknown>;
        objectAccess['a'] = a;
        objectAccess['value'] = 'value';
        objectAccess['b'] = b;

        const input = {
            a,
            b,
            array,
        };

        const output = uberJson.deserialize(uberJson.serialize(input)) as typeof input;

        expect(output).toEqual(input);
        // The string properties should be omitted during serialization.
        expect(Object.keys(objectAccess)).toEqual([ '0', 'a', 'value', 'b' ]);
        expect(Object.keys(output.array)).toEqual([ '0' ]);

        const incorrect = superJson.deserialize(superJson.serialize(input)) as typeof input;
        expect(incorrect).toEqual(input);
        // Reference objects are omitted from the actualy array, but are preserved as references and added back as `NaN`.
        expect(Object.keys(incorrect.array)).toEqual([ '0', 'NaN' ]);
    });

    test('reference keys in maps are handled correctly', () => {
        const a = {};
        const b = {};
        const map = new Map<unknown, unknown>([ [ a, 'a' ], [ b, 'b' ] ]);

        const input = { a, b, map };

        const output = uberJson.deserialize(uberJson.serialize(input)) as typeof input;
        // No testing for equality as the comparer doesn't handle references as keys.
        expect([ ...output.map.values() ]).toEqual([ 'a', 'b' ]);

        const incorrect = superJson.deserialize(superJson.serialize(input)) as typeof input;
        // During deserialization, superJson first transforms maps into Map objects and only after that applies deduplication.
        // However, if multiple references are used as map keys, all of them are serialized as `null`. When the map is created, all nulls are mapped to the same key. Deduplication after that won't fix this.
        expect([ ...incorrect.map.values() ]).toEqual([ 'b', undefined ]);
    });
});

describe('deduplication', () => {
    // TODO
});
