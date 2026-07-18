import { expect, test, describe } from 'bun:test';
import { uberJson } from '../src/uberJson.js';
import type { Annotations, JsonArray, JsonValue } from '../src/json.js';

describe('predefined types', () => {
    test.each([
        '',
        'a',
        0,
        1,
        false,
        true,
        null,
    ])('primitive %p', value => {
        expect(uberJson.serialize({ value })).toEqual({ value });
    });

    test('undefined', () => {
        expect(uberJson.serialize({ value: undefined })).toEqual({
            $: { value: 'undefined' },
            value: null,
        });
    });

    test.each([
        [ NaN, 'NaN' ],
        [ Infinity, 'Infinity' ],
        [ -Infinity, '-Infinity' ],
        [ -0, '-0' ],
    ])('number %p to "%s"', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: 'number' },
            value: expected,
        });
    });

    test.each([
        [ 1n, '1' ],
        [ -1n, '-1' ],
        [ 1234567890123456789012345678901234567890n, '1234567890123456789012345678901234567890' ],
        [ BigInt(Number.MAX_SAFE_INTEGER) + 2n, String(BigInt(Number.MAX_SAFE_INTEGER) + 2n) ],
    ])('bigint %p to "%s"', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: 'bigint' },
            value: expected,
        });
    });

    test.each([
        [ 1n, '1' ],
        [ -1n, '-1' ],
        [ 1234567890123456789012345678901234567890n, '1234567890123456789012345678901234567890' ],
        [ BigInt(Number.MAX_SAFE_INTEGER) + 2n, String(BigInt(Number.MAX_SAFE_INTEGER) + 2n) ],
    ])('container %p to "%s"', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: 'bigint' },
            value: expected,
        });
    });

    test.each([
        [ {}, {} ],
        [ { 0: 1 }, { 0: 1 } ],
        [ { a: 1 }, { a: 1 } ],
        [ { a: undefined }, { a: null, $: { a: 'undefined' } } ],
    ])('object %p', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({ value: expected });
    });

    test.each([
        [ [] ],
        [ [ 1 ] ],
        [ [ null, true, 'a', 1 ] ],
        [ [ [] ] ],
        [ [ [ 1 ], [ 2 ] ] ],
    ])('array %p', (value: JsonArray) => {
        expect(uberJson.serialize({ value })).toEqual({ value });
    });

    test.each([ [
        [ undefined ],
        [ null ],
        { 'value.0': 'undefined' },
    ], [
        [ 1, [ [ undefined ], 2 ] ],
        [ 1, [ [ null ], 2 ] ],
        { 'value.1.0.0': 'undefined' },
    ] ])('array %p to %p', (value: unknown[], expected: JsonArray, annotations: Annotations<'$'>) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: annotations,
            value: expected,
        });
    });

    test.each([
        [ [] ],
        [ [ 1 ] ],
        [ [ null, true, 'a', 1 ] ],
        [ [ [] ] ],
        [ [ [ 1 ], [ 2 ] ] ],
    ])('set %p', (value: JsonArray) => {
        expect(uberJson.serialize({ value: new Set(value) })).toEqual({
            $: { value: 'Set' },
            value,
        });
    });

    test.each([ [
        [ undefined ],
        [ null ],
        { 'value.0': 'undefined' },
    ], [
        [ 1, [ [ undefined ], 2 ] ],
        [ 1, [ [ null ], 2 ] ],
        { 'value.1.0.0': 'undefined' },
    ] ])('set %p to %p', (value: unknown[], expected: JsonArray, annotations: Annotations<'$'>) => {
        expect(uberJson.serialize({ value: new Set(value) })).toEqual({
            $: { value: 'Set', ...annotations },
            value: expected,
        });
    });

    test.each<[[JsonValue, JsonValue][]]>([
        [ [] ],
        [ [ [ null, true ], [ 'a', 1 ], [ true, null ] ] ],
        [ [ [ [], {} ], [ {}, [] ] ] ],
    ])('map %p', value => {
        expect(uberJson.serialize({ value: new Map(value) })).toEqual({
            $: { value: 'Map' },
            value,
        });
    });

    test.each<[[unknown, unknown][], [JsonValue, JsonValue][], Annotations<'$'>]>([ [
        [ [ undefined, undefined ] ],
        [ [ null, null ] ],
        { 'value.0.0': 'undefined', 'value.0.1': 'undefined' },
    ], [
        [ [ 'key', [ undefined ] ], [ [ undefined ], 'value' ] ],
        [ [ 'key', [ null ] ], [ [ null ], 'value' ] ],
        { 'value.0.1.0': 'undefined', 'value.1.0.0': 'undefined' },
    ] ])('map %p to %p', (value, expected, annotations) => {
        expect(uberJson.serialize({ value: new Map(value) })).toEqual({
            $: { value: 'Map', ...annotations },
            value: expected,
        });
    });

    test.each([
        [ new Date('2000-01-01T00:00:00.000Z'), '2000-01-01T00:00:00.000Z' ],
        [ new Date('1234-12-12T12:34:56.789Z'), '1234-12-12T12:34:56.789Z' ],
        [ new Date(NaN), null ],
    ])('Date %p to %p', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: 'Date' },
            value: expected,
        });
    });

    test.each([
        [ /abc/g, '/abc/g' ],
        [ /a.*([^{]){0,4}/, '/a.*([^{]){0,4}/' ],
    ])('RegExp %p to %p', (value, expected) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: 'RegExp' },
            value: expected,
        });
    });

    test.each([
        [ new URL('https://example.com'), 'https://example.com/', 'URL' ],
        [ new URL('https://example.com/abc%20efg?param=value&next=true#fragment'), 'https://example.com/abc%20efg?param=value&next=true#fragment', 'URL' ],
    ])('URL %o to %p', (value, expected, annotation) => {
        expect(uberJson.serialize({ value })).toEqual({
            $: { value: annotation },
            value: expected,
        });
    });

    // test.each([
    //     [ new Error('error message'), 'error message', 'Error' ],
    // ])('Error %p to %p', (value, expected, annotation) => {
    //     expect(uberJson.serialize({ value })).toEqual({
    //         $: { value: annotation },
    //         value: expected,
    //     });
    // });
});
