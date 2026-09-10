# PowerJson

Serialize any JavaScript object to pure JSON and back, including built-in types, custom classes, circular references, and more.

- Zero dependencies
- Human-readable output, consistent across versions
- Pure JSON, no custom grammar
- Reliable, well-tested
- [Fastest](./docs/benchmarks.md)

## Why PowerJson?

JSON has its limitations. Many libraries try to overcome them by extending its grammar or inventing elaborate serialization schemas. Unlike them, we want to keep the simplicity and human-readability of JSON while extending its capabilities.

PowerJson is heavily inspired by [SuperJSON](https://github.com/ravionhq/superjson#getting-started). It's a great library with the same goals as PowerJson, but it has [some design flaws](./docs/superjson-limitations.md) that lead to worse performance, less readable output, and even bugs in some edge cases. PowerJson is an attempt to fix these issues and provide a better alternative to SuperJSON. Check out [all differences](./docs/advanced-topics.md) and a [performance comparison](./docs/benchmarks.md#results).

## Basic usage

You can use PowerJson as a drop-in replacement for `JSON.stringify` and `JSON.parse`. It has a similar API, but it can handle many more types of values:

```ts
import { PowerJson } from 'powerjson';

const data = {
    a: NaN,
    b: new Date(0),
    c: new Set([ 'key' ]),
};

const jsonString = PowerJson.stringify(data, 4);
/*
{
    "$": {
        "$": 1,
        "a": "number",
        "b": "Date",
        "c": {
            "0": "Set"
        }
    },
    "a": "NaN",
    "b": "1970-01-01T00:00:00.000Z",
    "c": [
        "key"
    ]
}
*/

const parsedData = PowerJson.parse(jsonString);
```

### API

Use the `serialize` & `deserialize` functions to convert between JavaScript values and PowerJson's JSON-compatible representation without converting to a string. This is useful for, e.g., passing the data to a database which does it's own stringification. These functions are available both as methods on `PowerJson` and as standalone functions (for tree shaking).

Besides this (and some utility functions), the API is intentionally kept minimal. If you feel like something is missing, please communicate your use case in an issue.

### TypeScript

There is no type validation so you shouldn't rely on the type of the deserialized value. However, if you want, you can pass a generic type parameter to `parse` and `deserialize` functions to explicitly cast the result. Otherwise, the return type will be `unknown`.

### Configuration

We try to keep the configuration minimal. However, in some use cases, these options can greatly enhance performance:

- `deduplicate` (default: `false`) - see the [Referential equality](./docs/advanced-topics.md#referential-equality) section for details.
- `sortObjectKeys` (default: `catch`) - see the [Object key order](./docs/advanced-topics.md#object-key-order) section for details.

The default `PowerJson` instance is immutable; you are supposed to create a new instance with custom configuration:

```ts
const powerJson = new PowerJson({ deduplicate: true });
```

## Supported types

These types are supported by PowerJson (so far). More types will be added as they become part of the standard JavaScript API (e.g., `Temporal`).

| type                                                                                       | supported by standard JSON? | supported by PowerJson? |
| ------------------------------------------------------------------------------------------ | --------------------------- | ----------------------- |
| `string`                                                                                   | ✅                          | ✅                      |
| `number`                                                                                   | ⚠️ (1.)                     | ✅                      |
| `boolean`                                                                                  | ✅                          | ✅                      |
| `null`                                                                                     | ✅                          | ✅                      |
| `Array`                                                                                    | ✅                          | ✅                      |
| `Object`                                                                                   | ✅                          | ✅                      |
| `undefined`                                                                                | ❌                          | ✅                      |
| `bigint`                                                                                   | ❌                          | ✅                      |
| `symbol`                                                                                   | ❌                          | ✅ (2.) TODO            |
| `Set`                                                                                      | ❌                          | ✅                      |
| `Map`                                                                                      | ❌                          | ✅                      |
| `Date`                                                                                     | ❌                          | ✅                      |
| `Temporal`                                                                                 | ❌                          | ❌ TODO                 |
| `RegExp`                                                                                   | ❌                          | ✅                      |
| `URL`                                                                                      | ❌                          | ✅                      |
| `Error`                                                                                    | ❌                          | ❌ TODO                 |
| [Typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Typed_arrays) | ❌                          | ✅                      |

1. Some values (`NaN`, `Infinity`, `-Infinity`, and `-0`) are not supported in standard JSON.
2. Needs to be registered first (see below).

### Custom classes

Any object with an unsupported type will be serialized as a plain JS object. You can change that by registering a custom transformer for your class. For example, transformer for Luxon's `DateTime` might look like this:

```ts
import { PowerJson, transformer } from 'powerjson';

const dateTimeTransformer = transformer({
    clazz: DateTime,
    type: 'DateTime',
    serialize: value => value.toISO()!,
    deserialize: value => DateTime.fromISO(value, { setZone: true }),
    isEntity: false,    // Referential equalities won't be preserved for this type.
    isComposite: false, // The type won't be serialized to an array.
});

// Use the same PowerJson instance everywhere in your codebase.
export const powerJson = new PowerJson({ transformers: [ dateTimeTransformer ] });
```

See [custom tests](./tests/custom.test.ts) for more examples.

### Symbols

Symbols in object keys will be ignored. Symbols in values will be replaced with their IDs if they are registered. Otherwise, they will be ignored. To register symbols, pass an array of symbols or symbol-ID pairs to the configuration:

```ts
import { PowerJson } from 'powerjson';

const symbolA = Symbol('symbolA');
const symbolB = Symbol('symbolB');
const empty = Symbol();

export const powerJson = new PowerJson({
    symbols: [
        symbolA,            // The symbol's description will be used as the ID.
        [ symbolB, 'bId' ], // `bId` will be used as the ID.
        // empty,           // Don't do this, it will throw an error.
        [ empty, 'empty' ], // This is fine, the 'empty' will be used as the ID.
    ],
});
```

## Non-goals

Some things are just not worth the effort. We don't plan to support:

- Functions, any kind of executable code, etc. If you still think you need this, just don't.
- Sparse arrays (e.g., `new Array(3)` or `[ 1, , 3 ]`). All holes will be replaced with `undefined`.
- Non-numeric properties of arrays, symbol properties of objects. They will be ignored.
- Build-in types (e.g., `Set`, `Date`) across different realms (e.g., iframes, web workers). Only the same realm's instances will be serialized correctly.
- Type validation. Just use [Zod](https://zod.dev/).
