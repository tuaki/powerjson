import { expect, test, describe } from 'bun:test';
import { testIdentityEqualities } from './utils.js';

describe('utils', () => {
    test('finds references behind excluded wrappers', () => {
        class Wrapper {
            readonly value: unknown;

            constructor(value: unknown) {
                this.value = value;
            }

            self?: unknown;
        }

        const sharedA = { value: 1 };
        const wrapperA = new Wrapper(sharedA);
        wrapperA.self = wrapperA;

        const sharedBFromWrapper = { value: 1 };
        const wrapperB = new Wrapper(sharedBFromWrapper);
        wrapperB.self = wrapperB;

        const a = {
            direct: sharedA,
            wrapper: wrapperA,
        };
        const b = {
            direct: { value: 1 },
            wrapper: wrapperB,
        };

        expect(a).toStrictEqual(b);
        expect(() => testIdentityEqualities(a, b, [ Wrapper ])).toThrow();
    });
});
