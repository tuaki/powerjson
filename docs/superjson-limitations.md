# SuperJSON limitations

The main issues with SuperJSON are:
- [Unnecessary nesting](#unnecessary-nesting)
- [Bugs in references](#bugs-in-references)
- [Non-locality of annotations](#non-locality-of-annotations)
- [Poor performance](#poor-performance)
If there was a way how to fix them, we would just open a PR. Unfortunately, theses issues are fundamental to the design of SuperJSON and cannot be fixed without breaking backward compatibility.

## Unnecessary nesting

Ultimately, anything serialized with SuperJSON looks like this:

```ts
{
    json: JSONValue; // the actual data
    meta?: {
        values?: MinimisedTree<TypeAnnotation>; // type annotations
        referentialEqualities?: ReferentialEqualityAnnotations; // reference annotations
        v?: number; // version
    };
}
```

I.e., there is always an additional level of nesting. This means one extra click when inspecting a request's data in developer tools, one extra level of indentation when reading the data in a log, and so on. In PowerJson, we store the annotations in a special `$` property of the object itself. If the value being serialized is a plain JS object, there will be no additional nesting.

## Non-locality of annotations

SuperJSON stores all type annotations in the `meta.values` property:

```ts
{
    json: {
        a: {
            b: 'NaN',
        },
    },
    meta: {
        values: {
            'a.b': [ 'number' ],
        },
    },
}
```

This makes large objects hard to read, because we have to navigate long paths in the `meta.values` object to find the type annotations. In PowerJson, the same object would look like this:

```ts
{
    a: {
        $: {
            b: 'number',
        },
        b: 'NaN',
    },
}
```

## Bugs in references

Deserialization in SuperJSON works in this order: all type annotations are applied first, and then all references are restored. This can lead to bugs in some edge cases. For example, consider the following object:

```ts
const a = { id: 1 };
const b = { id: 2 };

const trickyObject = {
    a,
    b,
    m: new Map([
        [ a, 'A' ],
        [ b, 'B' ],
    ]),
};
```

If we enable deduplication, SuperJSON will serialize it as:

```ts
{
    json: {
        a: { id: 1 },
        b: { id: 2 },
        m: [
            [ null, 'A' ],
            [ null, 'B' ],
        ],
    },
    meta: {
        values: {
            m: [ 'map' ],
        },
        referentialEqualities: {
            a: [ 'm.0.0' ],
            b: [ 'm.1.0' ],
        },
    }
}
```

Notice that only the first occurrences of objects `a` and `b` are serialized, and the other occurrences are replaced with `null`. The `meta.referentialEqualities` property then tells us that `m.0.0` is a reference to `a`, and `m.1.0` is a reference to `b`. The map is serialized as an array of key-value pairs, exactly like the `Map` constructor expects. So far so good. However, as mentioned above, SuperJSON deserializes the type annotations first - which means that the map will have only one key-value pair, because both keys are `null` at this point. The references can no longer be restored correctly since the path `m.0.0` now leads to the object `b` instead of `a` and the path `m.1.0` doesn't even exist.

## Poor performance

The issues above already cause important performance problems:
1. Stringifying and parsing the paths is actually very expensive. There is a lot of string manipulation and escaping (e.g., `.` in keys is escaped as `\.`).
2. The paths in maps use indexes (like `m.0.0`) to refer to the values by their index (the same is true for sets, e.g., `s.0`). JS maps do guarantee that the keys are iterated in the order of insertion, but they don't provide a method for accessing a key by its index. So, SuperJSON has to iterate over the map to find the key in O(n) time. There is an [issue](https://github.com/ravionhq/superjson/issues/346) about this, but the [PR](https://github.com/ravionhq/superjson/pull/344) is still open.

### Serialization function lookup

Probably the most significant performance bottleneck is in finding the serialization function for a given value. SuperJSON uses a linear search over all registered serializers, calling their `isApplicable` function until it returns `true`. This is done even for the most basic types like `undefined`, `number`, etc. PowerJson uses a [much faster approach](advanced-topics.md#serialization-function-lookup) base on a `switch (typeof value)` statement for primitive types, and a `Map` of object prototypes for instant lookup of classes.

### Typed arrays

SuperJSON serializes values like `new Uint8Array([1, 2, 3])` as numeric arrays. This is extremely inefficient (for both space and time), so PowerJson uses base64 encoding instead.

### Where is SuperJSON faster

SuperJSON has one specific advantage: during deserialization, it checks only the `meta` property for type and reference annotations, while PowerJson has to traverse the entire object to find all `$` properties. This means that if there is a large object with very few annotations, SuperJSON can be faster. However, in most real-world scenarios, the number of annotations is proportional to the size of the object, so PowerJson is usually faster. Besides that, the total time of stringify + parse is usually dominated by the serialization step, which is much faster in PowerJson.
