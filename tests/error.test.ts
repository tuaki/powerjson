import { expect, test, describe } from 'bun:test';
import { Tester } from './utils.ts';
import { PowerJson } from '../src/powerJson.ts';

// This file focuses on the `Error` transformer, which tries to follow the html structured serialization algorithm (see the links in `src/transformers.ts`).
// Errors have a lot of edge cases - native subtypes, non-standard/unrecognized names, non-data `message` properties, `stack`/`cause` visibility, custom properties, and (self-)circular references - so each of those gets its own focused test here.

describe('basic Error serialization', () => {
    const tester = Tester.createForAll();

    test.each([
        [
            new Error('error A'),
            {
                name: 'Error',
                message: 'error A',
            },
        ],
        [
            new Error('error B', { cause: 'cause C' }),
            {
                name: 'Error',
                message: 'error B', cause: 'cause C',
            },
        ],
        [
            new Error('error D', { cause: new Error('error E') }),
            {
                name: 'Error',
                message: 'error D',
                cause: {
                    name: 'Error',
                    message: 'error E',
                },
                $: { cause: 'Error' },
            },
        ],
        [
            new Error('error B', { cause: undefined }),
            {
                name: 'Error',
                message: 'error B',
                cause: null,
                $: { cause: 'undefined' },
            },
        ],
        [
            Object.assign(new Error('error F'), {
                code: 'E_CUSTOM',
                retryable: true,
            }),
            {
                name: 'Error',
                message: 'error F',
                code: 'E_CUSTOM',
                retryable: true,
            },
        ],
        [
            Object.assign(new Error('error G'), {
                details: {
                    requestId: 'request-123',
                    tags: [ 'api', 'retry' ],
                },
            }),
            {
                name: 'Error',
                message: 'error G',
                details: {
                    requestId: 'request-123',
                    tags: [ 'api', 'retry' ],
                },
            },
        ],
    ])('Error %o to %p', (input, expected) => {
        tester.serializeDeserialize({ input }, {
            input: expected,
            $: { input: 'Error' },
        });
    });
});

describe('native error subtypes', () => {
    const tester = Tester.createForAll();

    test.each([
        [ Error, 'Error' ],
        [ TypeError, 'TypeError' ],
        [ RangeError, 'RangeError' ],
        [ ReferenceError, 'ReferenceError' ],
        [ SyntaxError, 'SyntaxError' ],
        [ EvalError, 'EvalError' ],
        [ URIError, 'URIError' ],
    ] as [ new (message: string) => Error, string ][])('%s round-trips', (constructor, name) => {
        const input = new constructor(`an ${name}`);

        const outputs = tester.serializeDeserialize({ input }, {
            input: {
                name,
                message: `an ${name}`,
            },
            $: { input: 'Error' },
        });

        for (const { input: output } of outputs)
            expect(output).toBeInstanceOf(constructor);
    });
});

describe('unrecognized error names', () => {
    const tester = Tester.createForAll();

    class CustomError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'CustomError';
        }
    }

    test('a custom subclass with a non-standard name degrades to a plain Error', () => {
        const input = new CustomError('custom message');

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                input: {
                    name: 'Error',
                    message: 'custom message',
                },
                $: { input: 'Error' },
            });
            expect(serialized).toStrictEqual(expected);

            // The constructor legitimately differs from the input, so a plain `toStrictEqual` round-trip check (which also compares constructors) would be too strict here.
            const { input: output } = serializer.deserialize<{ input: Error }>(serialized);
            expect(output).toBeInstanceOf(Error);
            expect(output).not.toBeInstanceOf(CustomError);
            expect(output.name).toBe('Error');
            expect(output.message).toBe('custom message');
        });
    });
});

describe('message edge cases', () => {
    const tester = Tester.createForAll();

    test('an Error constructed without a message round-trips to an empty message', () => {
        const input = new Error();
        expect(input.message).toBe('');

        tester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: null,
                $: { message: 'undefined' },
            },
            $: { input: 'Error' },
        });
    });

    test('a non-data (getter-only) message is treated as absent', () => {
        const input = new Error('will be replaced');
        Object.defineProperty(input, 'message', { get: () => 'computed', enumerable: false, configurable: true });
        expect(input.message).toBe('computed');

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                input: {
                    name: 'Error',
                    message: null,
                    $: { message: 'undefined' },
                },
                $: { input: 'Error' },
            });
            expect(serialized).toStrictEqual(expected);

            const { input: output } = serializer.deserialize<{ input: Error }>(serialized);
            // The getter can't be captured as a data value, so the message is treated as if it was never set.
            expect(output.message).toBe('');
        });
    });

    test('a non-string message is coerced to a string', () => {
        const input = new Error('placeholder');
        Object.defineProperty(input, 'message', { value: 42, enumerable: false, writable: true, configurable: true });

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                input: {
                    name: 'Error',
                    message: '42',
                },
                $: { input: 'Error' },
            });
            expect(serialized).toStrictEqual(expected);

            const { input: output } = serializer.deserialize<{ input: Error }>(serialized);
            expect(output.message).toBe('42');
        });
    });

    test('an object message is coerced via its own toString', () => {
        const weirdMessage = { toString: () => 'weird!' };
        const input = new Error('placeholder');
        Object.defineProperty(input, 'message', { value: weirdMessage, enumerable: false, writable: true, configurable: true });

        tester.serialize({ input }, (serialized, serializer) => {
            const expected = Tester.addVersionToSerialized(serializer, {
                input: {
                    name: 'Error',
                    message: 'weird!',
                },
                $: { input: 'Error' },
            });
            expect(serialized).toStrictEqual(expected);

            const { input: output } = serializer.deserialize<{ input: Error }>(serialized);
            expect(output.message).toBe('weird!');
        });
    });
});

describe('stack', () => {
    const tester = Tester.createForAll();

    test('stack is omitted by default, even if explicitly set', () => {
        const input = new Error('has a stack');
        input.stack = 'Error: has a stack\n    at somewhere';

        const outputs = tester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: 'has a stack',
            },
            $: { input: 'Error' },
        });

        for (const { input: output } of outputs)
            expect(output.stack).toBeUndefined();
    });

    test('stack is preserved when allowStackInError is enabled', () => {
        const stackTester = new Tester([
            new PowerJson({ deduplicate: false, allowStackInError: true }),
            new PowerJson({ deduplicate: true, allowStackInError: true }),
        ], {
            preserveErrorStack: true,
        });

        const input = new Error('has a stack');
        input.stack = 'Error: has a stack\n    at somewhere';

        stackTester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: 'has a stack',
                stack: input.stack as string,
            },
            $: { input: 'Error' },
        });
    });
});

describe('custom properties', () => {
    const tester = Tester.createForAll();

    test('non-enumerable custom properties are dropped', () => {
        const input = new Error('has hidden extra');
        Object.defineProperty(input, 'hidden', { value: 'nope', enumerable: false, configurable: true, writable: true });

        const outputs = tester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: 'has hidden extra',
            },
            $: { input: 'Error' },
        });

        for (const { input: output } of outputs)
            expect(output).not.toHaveProperty('hidden');
    });

    test('enumerable getter-based custom properties are captured by their current value', () => {
        const input = new Error('has computed extra');
        Object.defineProperty(input, 'computed', { get: () => 99, enumerable: true, configurable: true });

        const outputs = tester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: 'has computed extra',
                computed: 99,
            },
            $: { input: 'Error' },
        });

        for (const { input: output } of outputs)
            expect((output as unknown as { computed: number }).computed).toBe(99);
    });
});

describe('circular references', () => {
    const tester = Tester.createForAll();

    test('mutually circular causes resolve to the very same instances', () => {
        const errorA = new Error('error A');
        const errorB = new Error('error B', { cause: errorA });
        // errorB already exists, so (unlike the constructor option above) this closes the cycle via a plain
        // assignment. `defineProperty` keeps `cause` non-enumerable, matching real `Error.cause` semantics.
        Object.defineProperty(errorA, 'cause', { value: errorB, writable: true, enumerable: false, configurable: true });

        const outputs = tester.serializeDeserialize({ input: errorA }, {
            input: {
                name: 'Error',
                message: 'error A',
                cause: {
                    name: 'Error',
                    message: 'error B',
                    cause: 1,
                    $: { cause: 'ref' },
                },
                $: { cause: 'Error' },
            },
            $: { input: 'Error' },
        }, {
            input: {
                name: 'Error',
                message: 'error A',
                cause: {
                    name: 'Error',
                    message: 'error B',
                    cause: 1,
                    $: { cause: 'ref' },
                },
                $: { cause: 'Error' },
            },
            $: { input: [ 'Error', 1 ] },
        });

        // The cause chain must be an actual cycle, not merely two structurally-equal errors.
        for (const { input: output } of outputs) {
            const outputCause = output.cause as Error;
            expect(outputCause.cause).toBe(output);
        }
    });

    test('a self-referencing custom property resolves to the very same instance', () => {
        const input: Error & { self?: unknown } = new Error('self ref');
        input.self = input;

        const outputs = tester.serializeDeserialize({ input }, {
            input: {
                name: 'Error',
                message: 'self ref',
                self: 1,
                $: { self: 'ref' },
            },
            $: { input: 'Error' },
        }, {
            input: {
                name: 'Error',
                message: 'self ref',
                self: 1,
                $: { self: 'ref' },
            },
            $: { input: [ 'Error', 1 ] },
        });

        for (const { input: output } of outputs) {
            const outputInput = output as Error & { self?: unknown };
            expect(outputInput.self).toBe(outputInput);
        }
    });
});

