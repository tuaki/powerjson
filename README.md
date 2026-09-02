# UberJson

Serialize any JavaScript object to pure JSON and back, including built-in types, custom classes, circular references, and more.

## Why UberJson?

JSON has its limitations. Many libraries try to overcome them by extending its grammar or inventing elaborate serialization schemas. Unlike them, we want to keep the simplicity and human-readability of JSON while extending its capabilities.

UberJson is heavily inspired by [SuperJSON](https://github.com/ravionhq/superjson#getting-started). It's a great library with the same goals as UberJson, but it has [some design flaws](./docs/superjson-limitations.md) that lead to worse performance, less readable output, and even bugs in some edge cases. UberJson is an attempt to fix these issues and provide a better alternative to SuperJSON. Additional differences between the two libraries are described [here](./docs/advanced-topics.md).

## Basic usage

You can use UberJson as a drop-in replacement for `JSON.stringify` and `JSON.parse`. It has the a similar API, but it can handle many more types of values:

```ts
import { UberJson } from 'uberjson';

const data = {
    a: NaN,
    b: new Date(0),
    c: new Set([ 'key' ]),
};

const jsonString = UberJson.stringify(data, 4);
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

const parsedData = UberJson.parse(jsonString);
```

### `serialize` & `deserialize`

Use these functions to convert between JavaScript values and UberJson's JSON-compatible representation without converting to a string. This is useful for, e.g., passing the data to a database which does it's own stringification.

### TypeScript

There is no type validation so you shouldn't rely on the type of the deserialized value. However, if you want, you can pass a generic type parameter to `parse` and `deserialize` functions to explicitly cast the result. Otherwise, the return type will be `unknown`.

### Configuration

We try to keep the configuration minimal. However, in some use cases, these options can greatly enhance performance:

- `deduplicate` (default: `false`) - see the [Referential equality](./docs/advanced-topics.md#referential-equality) section for details.
- `sortObjectKeys` (default: `catch`) - see the [Object key order](./docs/advanced-topics.md#object-key-order) section for details.

The default `UberJson` instance is immutable; you are supposed to create a new instance with custom configuration:

```ts
const uberJson = new UberJson({ deduplicate: true });
```

## Supported types

These types are supported by UberJson (so far). More types will be added as they become part of the standard JavaScript API (e.g., `Temporal`).

| type                                                                                       | supported by standard JSON? | supported by UberJson? |
| ------------------------------------------------------------------------------------------ | --------------------------- | ---------------------- |
| `string`                                                                                   | ✅                          | ✅                     |
| `number`                                                                                   | ⚠️ (1.)                     | ✅                     |
| `boolean`                                                                                  | ✅                          | ✅                     |
| `null`                                                                                     | ✅                          | ✅                     |
| `Array`                                                                                    | ✅                          | ✅                     |
| `Object`                                                                                   | ✅                          | ✅                     |
| `undefined`                                                                                | ❌                          | ✅                     |
| `bigint`                                                                                   | ❌                          | ✅                     |
| `symbol`                                                                                   | ❌                          | ❌ (2.) TODO           |
| `Set`                                                                                      | ❌                          | ✅                     |
| `Map`                                                                                      | ❌                          | ✅                     |
| `Date`                                                                                     | ❌                          | ✅                     |
| `Temporal`                                                                                 | ❌                          | ❌ TODO                |
| `RegExp`                                                                                   | ❌                          | ✅                     |
| `URL`                                                                                      | ❌                          | ✅                     |
| `Error`                                                                                    | ❌                          | ❌ TODO                |
| [Typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Typed_arrays) | ❌                          | ✅                     |

1. Some values (`NaN`, `Infinity`, `-Infinity`, and `-0`) are missing.
2. Needs to be registered (see below).

### Custom classes

Any object with an unsupported type will be serialized as a plain JS object. You can change that by registering a custom transformer for your class. For example, transformer for Luxon's `DateTime` might look like this:

```ts
import { UberJson, transformer } from 'uberjson';

const dateTimeTransformer = transformer({
    clazz: DateTime,
    type: 'DateTime',
    serialize: value => value.toISO()!,
    deserialize: value => DateTime.fromISO(value, { setZone: true }),
    isEntity: false,    // Referential equalities won't be preserved for this type (in the deduplication mode).
    isComposite: false, // The type won't be serialized to an array (or, if it will, it won't use type annotations for its properties).
});

const uberJson = new UberJson({ transformers: [ dateTimeTransformer ] });
```

See [custom tests](./tests/custom.test.ts) for more examples.

### Symbols

TODO
