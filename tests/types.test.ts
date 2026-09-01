import { expect, test, describe } from 'bun:test';
import { UberJson } from '../src/uberJson.js';
import type { Annotations, JsonArray, JsonMap } from '../src/json.js';
import { Tester, wrap } from './utils.js';

const tester = new Tester([
    new UberJson({ deduplicate: false }),
    new UberJson({ deduplicate: true }),
]);

describe('primitive types', () => {
    test.each([
        '',
        'a',
        0,
        1,
        false,
        true,
        null,
    ])('primitive %p', input => {
        tester.serializeDeserialize({ input }, { input });
        tester.serializeDeserialize(input, wrap(input));
    });

    test('undefined', () => {
        tester.serializeDeserialize({ input: undefined }, {
            $: { input: 'undefined' },
            input: null,
        });
        tester.serializeDeserialize(undefined, wrap(null, { w: 'undefined' }));
    });

    test.each([
        [ NaN, 'NaN' ],
        [ Infinity, 'Infinity' ],
        [ -Infinity, '-Infinity' ],
        [ -0, '-0' ],
    ])('number %p to "%s"', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'number' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'number' }));
    });

    test.each([
        [ 1n, '1' ],
        [ -1n, '-1' ],
        [ 1234567890123456789012345678901234567890n, '1234567890123456789012345678901234567890' ],
        [ BigInt(Number.MAX_SAFE_INTEGER) + 2n, String(BigInt(Number.MAX_SAFE_INTEGER) + 2n) ],
    ])('bigint %p to "%s"', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'bigint' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'bigint' }));
    });
});

describe('containers', () => {
    test.each([
        [ {}, {} ],
        [ { a: 1, b: 'c' }, { a: 1, b: 'c' } ],
        [ { 0: 1, 2: 3 }, { 0: 1, 2: 3 } ],
        [ { a: undefined }, { a: null, $: { a: 'undefined' } } ],
        [ { 'a.b': 1, 'c\\d': 2 }, { 'a.b': 1, 'c\\d': 2 } ],
        [ { 'a.b': NaN, 'c\\d': NaN }, { 'a.b': 'NaN', 'c\\d': 'NaN', $: { 'a.b': 'number', 'c\\d': 'number' } } ],
    ])('object %p', (input, expected) => {
        tester.serializeDeserialize({ input }, { input: expected });
        tester.serializeDeserialize(input, expected);
    });

    test.each([
        [ [] ],
        [ [ 1 ] ],
        [ [ null, true, 'a', 1 ] ],
        [ [ [] ] ],
        [ [ [ 1 ], [ 2 ] ] ],
    ])('array %p', (input: JsonArray) => {
        tester.serializeDeserialize({ input }, { input });
        tester.serializeDeserialize(input, wrap(input));
    });

    test.each([ [
        [ undefined ],
        [ null ],
        { input: { 1: 'undefined' } },
    ], [
        [ 1, [ [ undefined ], 2 ] ],
        [ 1, [ [ null ], 2 ] ],
        { input: { 4: 'undefined' } },
    ] ])('array %p to %p', (input: unknown[], expected: JsonArray, annotations: Annotations) => {
        tester.serializeDeserialize({ input }, {
            $: annotations,
            input: expected,
        });
    });

    test.each([ [
        [ undefined ],
        [ null ],
        { w: { 1: 'undefined' } },
    ], [
        [ 1, [ [ undefined ], 2 ] ],
        [ 1, [ [ null ], 2 ] ],
        { w: { 4: 'undefined' } },
    ] ])('root array %p to %p', (input: unknown[], expected: JsonArray, annotations: Annotations) => {
        tester.serializeDeserialize(input, wrap(expected, annotations));
    });

    test.each([
        [ [] ],
        [ [ 1 ] ],
        [ [ null, true, 'a', 1 ] ],
        [ [ [] ] ],
        [ [ [ 1 ], [ 2 ] ] ],
    ])('set %p', (input: JsonArray) => {
        tester.serializeDeserialize({ input: new Set(input) }, {
            $: { input: { 0: 'Set' } },
            input,
        });
        tester.serializeDeserialize(new Set(input), wrap(input, { w: { 0: 'Set' } }));
    });

    test.each([ [
        [ undefined ],
        [ null ],
        { input: { 0: 'Set', 1: 'undefined' } },
    ], [
        [ 1, [ [ undefined ], 2 ] ],
        [ 1, [ [ null ], 2 ] ],
        { input: { 0: 'Set', 4: 'undefined' } },
    ] ])('set %p to %p', (input: unknown[], expected: JsonArray, annotations: Annotations) => {
        tester.serializeDeserialize({ input: new Set(input) }, {
            $: annotations,
            input: expected,
        });
    });

    test.each<[JsonMap]>([
        [ [] ],
        [ [ [ 1, 1 ], [ '1', '1' ] ] ] ,
        [ [ [ null, true ], [ 'a', 1 ], [ true, null ] ] ],
        [ [ [ [], {} ], [ {}, [] ] ] ],
    ])('map %p', input => {
        tester.serializeDeserialize({ input: new Map(input) }, {
            $: { input: { 0: 'Map' } },
            input,
        });
        tester.serializeDeserialize(new Map(input), wrap(input, { w: { 0: 'Map' } }));
    });

    test.each<[[unknown, unknown][], JsonMap, Annotations]>([ [
        [ [ undefined, undefined ] ],
        [ [ null, null ] ],
        { input: { 0: 'Map', 2: 'undefined', 3: 'undefined' } },
    ], [
        [ [ 'key', [ undefined ] ], [ [ undefined ], 'input' ] ],
        [ [ 'key', [ null ] ], [ [ null ], 'input' ] ],
        { input: { 0: 'Map', 4: 'undefined', 7: 'undefined' } },
        // TODO This fails right now because of a bug in bun.
        // see https://github.com/oven-sh/bun/issues/34830
        // A copy of a superJson test. It works in both libraries, but differently.
        // - They treat regexes as entities, so their keys are unique.
        // - We treat regexes as values, however, internally are still entities. So, they are still unique keys.
        // ], [
        //     [ [ /a/g, 'foo' ], [ /a/g, 'bar' ] ],
        //     [ [ '/a/g', 'foo' ], [ '/a/g', 'bar' ] ],
        //     { input: { 0: 'Map', 2: 'RegExp', 5: 'RegExp' } },
    ] ])('map %p to %p', (input, expected, annotations) => {
        tester.serializeDeserialize({ input: new Map(input) }, {
            $: annotations,
            input: expected,
        });
    });

    test.each<[[unknown, unknown][], JsonMap, Annotations]>([ [
        [ [ undefined, undefined ] ],
        [ [ null, null ] ],
        { w: { 0: 'Map', 2: 'undefined', 3: 'undefined' } },
    ], [
        [ [ 'key', [ undefined ] ], [ [ undefined ], 'input' ] ],
        [ [ 'key', [ null ] ], [ [ null ], 'input' ] ],
        { w: { 0: 'Map', 4: 'undefined', 7: 'undefined' } },
    ] ])('root map %p to %p', (input, expected, annotations) => {
        tester.serializeDeserialize(new Map(input), wrap(expected, annotations));
    });
});

describe('special objects', () => {
    test.each([
        [ { $: NaN }, { $: { $$: 'number' }, $$: 'NaN' } ],
        [ { $: [ NaN ] }, { $: { $$: { 1: 'number' } }, $$: [ 'NaN' ] } ],
    ])('object with escape key %p', (input, expected) => {
        tester.serializeDeserialize({ input }, { input: expected });
        tester.serializeDeserialize(input, expected);
    });

    test('annotation is the first key', () => {
        const input = { a: 1, b: NaN };

        tester.serialize(input, serialized => {
            expect(Object.keys(serialized)).toStrictEqual([ '$', 'a', 'b' ]);
        });
    });

    test('object with null prototype', () => {
        tester.forEach(serializer => {
            const input: Record<string, unknown> = Object.create(null);
            input.date = new Date('2000-01-01T00:00:00.000Z');

            const output = serializer.parse<{ date: Date }>(serializer.stringify(input));

            expect(output.date).toBeInstanceOf(Date);
            expect(output.date.toISOString()).toBe('2000-01-01T00:00:00.000Z');
        });
    });

    const forbiddenObjectKeys = [ '__proto__', 'prototype', 'constructor' ];

    test.each(forbiddenObjectKeys)('serialization rejects forbidden key %s', forbiddenKey => {
        tester.forEach(serializer => {
            const input: Record<string, unknown> = Object.create(null);
            input[forbiddenKey] = 1;

            expect(() => serializer.serialize(input)).toThrowError(new RegExp(forbiddenKey));
        });
    });

    test.each(forbiddenObjectKeys)('deserialization rejects forbidden key %s', forbiddenKey => {
        tester.forEach(serializer => {
            const inputJson = `{ "${forbiddenKey}": 1 }`;

            expect(() => serializer.parse(inputJson)).toThrowError(new RegExp(forbiddenKey));
            expect((Object.prototype as Record<string, unknown>).value).toBeUndefined();
        });
    });
});

describe('typed arrays', () => {
    test.each([
        [ new Uint8Array([]), '' ],
        [ new Uint8Array([ 0 ]), 'AA==' ],
        [ new Uint8Array([ 0, 1 ]), 'AAE=' ],
        [ new Uint8Array([ 0, 1, 2 ]), 'AAEC' ],
        [ new Uint8Array([ 0, 1, 2, 3 ]), 'AAECAw==' ],
        [ new Uint8Array([ 248 ]), '-A==' ], // url-safe base64 encoding
        [ new Uint8Array(new Uint8Array([ 1, 1, 0, 1 ]).buffer, 2, 1), 'AA==' ], // same as [ 0 ]
    ])('Uint8Array %p to %s', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'Uint8Array' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'Uint8Array' }));
    });

    test.each([
        [ new Float64Array([]), '' ],
        [ new Float64Array([ 0.123 ]), 'sHJoke18vz8=' ],
        [ new Float64Array([ 0.123, 1.456 ]), 'sHJoke18vz-yne-nxkv3Pw==' ],
        [ new Float64Array([ -0, Infinity, -Infinity ]), 'AAAAAAAAAIAAAAAAAADwfwAAAAAAAPD_' ],
        // TODO For some reason, NaN fails. Maybe bun uses a different NaN comparison for Float64Array?
        // see https://github.com/oven-sh/bun/issues/34815
        // [ new Float64Array([ NaN ]), 'AAAAAAAA-H8=' ],
        // [ new Float64Array([ NaN, -0, Infinity, -Infinity ]), 'AAAAAAAA-H8AAAAAAAAAgAAAAAAAAPB_AAAAAAAA8P8=' ],
        [ new Float64Array([ Number.MAX_SAFE_INTEGER * 2 ]), '________T0M=' ],
    ])('Float64Array %p to %s', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'Float64Array' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'Float64Array' }));
    });
});

describe('predefined types', () => {
    test.each([
        [ new Date('2000-01-01T00:00:00.000Z'), '2000-01-01T00:00:00.000Z' ],
        [ new Date('1234-12-12T12:34:56.789Z'), '1234-12-12T12:34:56.789Z' ],
        // TODO toStrictEqual returns false for two invalid dates (even though it returns true for two NaNs).
        // see https://github.com/oven-sh/bun/issues/34816
        // Once it's fixed, unify this test with the one below.
        // [ new Date(NaN), null ],
    ])('Date %p to %p', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'Date' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'Date' }));
    });

    test('Invalid date', () => {
        tester.serialize({ input: new Date(NaN) }, serialized => {
            expect(serialized).toStrictEqual({
                $: { input: 'Date' },
                input: null,
            });
        });
    });

    test.each([
        [ /abc/g, '/abc/g' ],
        [ /a.*([^{]){0,4}/, '/a.*([^{]){0,4}/' ],
    ])('RegExp %p to %p', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'RegExp' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'RegExp' }));
    });

    test.each([
        [ new URL('https://example.com'), 'https://example.com/' ],
        [ new URL('https://example.com/abc%20efg?param=value&next=true#fragment'), 'https://example.com/abc%20efg?param=value&next=true#fragment' ],
    ])('URL %o to %p', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            $: { input: 'URL' },
            input: expected,
        });
        tester.serializeDeserialize(input, wrap(expected, { w: 'URL' }));
    });

    // TODO Add support for Symbol
    // TODO Add support for Temporal
    // TODO Add support for Error
    // test.each([
    //     [ new Error('error message'), 'error message' ],
    // ])('Error %p to %p', (input, expected) => {
    //     tester.serializeDeserialize({ input }, {
    //         $: { input: 'Error' },
    //         input: expected,
    //     });
    // });
});
