import { expect, test, describe } from 'bun:test';
import { Tester } from './utils.js';
import { UberJson } from '../src/uberJson.js';
import SuperJson from 'superjson';

describe('circular references', () => {
    const tester = new Tester([
        new UberJson({ deduplicate: false }),
        new UberJson({ deduplicate: true }),
    ]);

    const o: Record<string, unknown> = { name: 'o' };
    o.self = o;

    test('1 object, nested', () => {
        tester.serializeDeserialize({ o }, {
            o: {
                $: { self: 'ref' },
                name: 'o',
                self: 1,
            },
        }, {
            $: { o: 1 },
            o: {
                $: { self: 'ref' },
                name: 'o',
                self: 1,
            },
        });
    });

    test('1 object, root', () => {
        tester.serializeDeserialize(o, {
            $: { self: 'ref' },
            name: 'o',
            self: 0,
        });
    });

    const a: Record<string, unknown> = { name: 'a' };
    const b = { name: 'b', a };
    a.b = b;

    test('2 objects, nested', () => {
        tester.serializeDeserialize({ a }, {
            a: {
                name: 'a',
                b: {
                    $: { a: 'ref' },
                    name: 'b',
                    a: 1,
                },
            },
        }, {
            $: { a: 1 },
            a: {
                name: 'a',
                b: {
                    $: { a: 'ref' },
                    name: 'b',
                    a: 1,
                },
            },
        });
    });

    test('2 objects, root', () => {
        tester.serializeDeserialize(a, {
            name: 'a',
            b: {
                $: { a: 'ref' },
                name: 'b',
                a: 0,
            },
        });
    });

    test('3 objects', () => {
        // This seems excessive but it actually solved a bug.
        const input = { name: 'root', childA: a, childB: b };

        tester.serializeDeserialize(input, {
            name: 'root',
            childA: {
                name: 'a',
                b: {
                    $: { a: 'ref' },
                    name: 'b',
                    a: 1,
                },
            },
            childB: {
                name: 'b',
                a: {
                    $: { b: 'ref' },
                    name: 'a',
                    b: 1,
                },
            },
        }, {
            $: { childA: 1, childB: 'ref' },
            name: 'root',
            childA: {
                $: { b: 2 },
                name: 'a',
                b: {
                    $: { a: 'ref' },
                    name: 'b',
                    a: 1,
                },
            },
            childB: 2,
        });
    });

    test('2 arrays, nested', () => {
        const x: unknown[] = [ 'x' ];
        const y = [ 'y', x ];
        x.push(y);

        tester.serializeDeserialize({ x }, {
            $: { x: { 4: 'ref' } },
            x: [
                'x',
                [ 'y', 1 ],
            ],
        }, {
            $: { x: { 0: 1, 4: 'ref' } },
            x: [
                'x',
                [ 'y', 1 ],
            ],
        });
    });

    test('1 array, nested', () => {
        const z: unknown[] = [ 'z' ];
        z.push(z);

        tester.serializeDeserialize({ z }, {
            $: { z: { 2: 'ref' } },
            z: [
                'z',
                1,
            ],
        }, {
            $: { z: { 0: 1, 2: 'ref' } },
            z: [
                'z',
                1,
            ],
        });
    });

    test('1 array, root', () => {
        const z: unknown[] = [ 'z' ];
        z.push(z);

        tester.serializeDeserialize(z, {
            $: { $: 'wrapped', w: { 2: 'ref' } },
            w: [
                'z',
                1,
            ],
        }, {
            $: { $: 'wrapped', w: { 0: 1, 2: 'ref' } },
            w: [
                'z',
                1,
            ],
        });
    });

    test('set', () => {
        const s = new Set();
        s.add(s);

        tester.serializeDeserialize({ s }, {
            $: { s: { 0: 'Set', 1: 'ref' } },
            s: [
                1,
            ],
        }, {
            $: { s: { 0: [ 'Set', 1 ], 1: 'ref' } },
            s: [
                1,
            ],
        });
    });

    test('set root', () => {
        const s = new Set();
        s.add(s);

        tester.serializeDeserialize(s, {
            $: { $: 'wrapped', w: { 0: 'Set', 1: 'ref' } },
            w: [
                1,
            ],
        }, {
            $: { $: 'wrapped', w: { 0: [ 'Set', 1 ], 1: 'ref' } },
            w: [
                1,
            ],
        });
    });

    test('map', () => {
        const m = new Map();
        m.set(m, m);

        tester.serializeDeserialize({ m }, {
            $: { m: { 0: 'Map', 2: 'ref', 3: 'ref' } },
            m: [
                [ 1, 1 ],
            ],
        }, {
            $: { m: { 0: [ 'Map', 1 ], 2: 'ref', 3: 'ref' } },
            m: [
                [ 1, 1 ],
            ],
        });
    });

    test('map root', () => {
        const m = new Map();
        m.set(m, m);

        tester.serializeDeserialize(m, {
            $: { $: 'wrapped', w: { 0: 'Map', 2: 'ref', 3: 'ref' } },
            w: [
                [ 1, 1 ],
            ],
        }, {
            $: { $: 'wrapped', w: { 0: [ 'Map', 1 ], 2: 'ref', 3: 'ref' } },
            w: [
                [ 1, 1 ],
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

        expect(output).toStrictEqual(input);
        // The string properties should be omitted during serialization.
        expect(Object.keys(objectAccess)).toStrictEqual([ '0', 'a', 'value', 'b' ]);
        expect(Object.keys(output.array)).toStrictEqual([ '0' ]);

        // This is an error in superJson.
        const incorrect = superJson.deserialize(superJson.serialize(input)) as typeof input;
        expect(incorrect).toStrictEqual(input);
        // Reference objects are omitted from the actualy array, but are preserved as references and added back as `NaN`.
        expect(Object.keys(incorrect.array)).toStrictEqual([ '0', 'NaN' ]);
    });

    test('reference keys in maps are handled correctly', () => {
        const a = {};
        const b = {};
        const map = new Map<unknown, unknown>([ [ a, 'a' ], [ b, 'b' ] ]);

        const input = { a, b, map };

        const output = uberJson.deserialize(uberJson.serialize(input)) as typeof input;
        // No testing for equality as the comparer doesn't handle references as keys.
        expect([ ...output.map.values() ]).toStrictEqual([ 'a', 'b' ]);

        // This is an error in superJson.
        const incorrect = superJson.deserialize(superJson.serialize(input)) as typeof input;
        // During deserialization, superJson first transforms maps into Map objects and only after that applies deduplication.
        // However, if multiple references are used as map keys, all of them are serialized as `null`. When the map is created, all nulls are mapped to the same key. Deduplication after that won't fix this.
        expect([ ...incorrect.map.values() ]).toStrictEqual([ 'b', undefined ]);
    });
});

describe('deduplication', () => {
    const tester = new Tester([
        new UberJson({ deduplicate: true }),
    ]);


    test('inserts ids to array without previous annotation', () => {
        const object = { name: 'object' };
        const array = [ object ];

        const input = {
            array,
            object,
        };

        tester.serializeDeserialize(input, {
            $: {
                array: { 1: 2 },
                object: 'ref',
            },
            array: [
                { name: 'object' },
            ],
            object: 2,
        });
    });

    test('preserves references in containers', () => {
        const sharedObject = { name: 'shared' };
        const uniqueObject = { name: 'unique' };
        const sharedArray = [ sharedObject, uniqueObject ];
        const uniqueArray = [ sharedObject, uniqueObject ];

        const input = {
            array: [ sharedObject, sharedObject, uniqueObject, sharedArray, sharedArray, uniqueArray ],
            object: {
                first: sharedObject,
                second: uniqueObject,
                sharedArray,
                uniqueArray,
            },
        };

        tester.serializeDeserialize(input);
    });

    test('preserves references in maps and sets', () => {
        const shared: Record<string, unknown> = { name: 'shared' };
        shared.self = shared;

        const set = new Set([ shared ]);
        const map = new Map<unknown, unknown>([
            [ shared, set ],
            [ set, shared ],
        ]);

        const input = {
            shared,
            set,
            map,
            array: [ shared, set, map ],
        };

        tester.serializeDeserialize(input);
    });

    test('preserves references for keys that need path escaping', () => {
        const shared = { value: 1 };

        const input = {
            'a.b': shared,
            a: {
                b: { value: 2 },
            },
            'a.b\\': shared,
            nested: {
                'c.d': shared,
            },
        };

        tester.serializeDeserialize(input);
    });
});

describe('shuffled json', () => {
    const tester = new Tester([
        new UberJson({ deduplicate: false }),
        new UberJson({ deduplicate: true, sortObjectKeys: true }),
    ], {
        reverseJsonOrder: true,
    });

    test('reorders direct sibling references', () => {
        const shared = { value: 1 };
        const input = {
            first: shared,
            second: shared,
            nested: { third: shared },
        };

        tester.serializeDeserialize(input);
    });

    test('reorders nested repeated references across objects and arrays', () => {
        const shared = { value: 1 };
        const input = {
            left: {
                direct: shared,
                list: [ shared, { value: 2, ref: shared }, [ shared ] ],
            },
            right: shared,
            other: {
                nested: { ref: shared },
            },
        };

        tester.serializeDeserialize(input);
    });

    test('reorders mixed object graphs with cyclic references', () => {
        const shared = { value: 1 };
        const child = { name: 'child' };
        const node: Record<string, unknown> = { name: 'root', child };
        node.child = {
            ...child,
            parent: node,
            ref: shared,
        };
        node.self = node;

        const input = {
            node,
            alias: node,
            shared,
            list: [ shared, node.child, node ],
        };

        tester.serializeDeserialize(input);
    });

    test('reorders map and set entries while preserving inner references', () => {
        const shared = { value: 1 };
        const set = new Set([ shared, { value: 2, ref: shared } ]);
        const map = new Map<unknown, unknown>([
            [ shared, { inner: shared } ],
            [ { value: 3 }, shared ],
        ]);

        const input = {
            shared,
            set,
            map,
            array: [ shared, set, map ],
        };

        tester.serializeDeserialize(input);
    });

    test('reorders deeply nested object keys inside arrays and objects', () => {
        const shared = { value: 1 };
        const input = {
            root: {
                a: [
                    { ref: shared, b: shared },
                    { c: { d: shared } },
                ],
            },
            left: shared,
            right: {
                nested: [
                    { q: shared },
                    { p: { r: shared } },
                ],
            },
        };

        tester.serializeDeserialize(input);
    });

    test('reorders references inside escaped $ payload', () => {
        const shared = { value: 1 };

        const input = {
            $: {
                first: shared,
                second: shared,
            },
        };

        tester.serializeDeserialize(input);
    });

    test('reorders $ property and its siblings', () => {
        const shared1 = { value: 1 };
        const shared2 = { value: 2 };

        const input = {
            shared1,
            $: {
                shared1,
                shared2,
            },
            shared2,
        };

        tester.serializeDeserialize(input);
    });
});
