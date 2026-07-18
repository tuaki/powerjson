import { expect, test, describe } from 'bun:test';
import { uberJson } from '../src/uberJson.js';

describe('basic e2e', () => {
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
});
