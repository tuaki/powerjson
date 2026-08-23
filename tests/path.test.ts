import { expect, test, describe } from 'bun:test';
import { parsePath, escapeKey } from '../src/path.js';

describe('parsePath', () => {
    test.each([
        [ 'test.a.b', [ 'test', 'a', 'b' ] ],
        [ 'test\\.a.b', [ 'test.a', 'b' ] ],
        [ 'test\\\\.a.b', [ 'test\\', 'a', 'b' ] ],
        [ 'test\\\\a.b', [ 'test\\a', 'b' ] ],
    ])('parsePath(%s) === %p', (input, expectedOutput) => {
        expect(parsePath(input)).toStrictEqual(expectedOutput);
    });

    test.each([
        'test\\a.b',
        'foo.bar.baz\\',
    ])('parsePath(%s) is rejected', input => {
        expect(() => parsePath(input)).toThrowError();
    });
});

describe('escapeKey', () => {
    test.each([
        [ 'dontescape', 'dontescape' ],
        [ 'escape.me', 'escape\\.me' ],
    ])('escapeKey(%s) === %s', (input, expectedOutput) => {
        expect(escapeKey(input)).toStrictEqual(expectedOutput);
    });
});
