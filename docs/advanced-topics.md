# Advanced topics

Although serialization seems like a simple task, there are many edge cases and non-trivial design decisions that need to be made. If you want to use UberJson effectively, you should familiarize yourself with the following topics. Also, if you have any experience with SuperJSON, this document covers all major differences.

## Escape key

The `$` key is used for annotations. You can use it as a regular key in your objects, but we advise you not to do so. If you use it anyway, it will be escaped so expect a minor performance penalty. (Basically, any key consisting of only `$` characters will be extended with an additional `$` character.)

There is no option to change the escape key. *This is by design.* We don't want to allow an infinite number of mutually incompatible UberJson variants.

## Referential equality

In JS, all objects are compared by reference. However, tracking referential equality across all serialized objects introduces non-trivial performance overhead. Therefore, we let the user decide between two modes of operation:

1. **Simple** (default): UberJson will not track referential equality, and will serialize all objects as if they were unique. The only exception is for circular references - if an object is equal to one of its ancestors, it will be serialized as a reference to that ancestor.
2. **Deduplication**: UberJson will track referential equality across all *objects* (see below what we mean by "objects"). Whenever an object is equal to any previously encountered object, it will be serialized as a reference to that object.

The first is faster and produces smaller output for objects with few or no repeated references while the second can be much more efficient for objects with many repeated references. There is no option for *both* tracking the referential equalities *and* printing all objects to the JSON output - we think there is no use case for that, and it would be a waste of time and space. However, if you find a valid use case, please let us know.

*SuperJSON also allows for two modes. However, it tracks referential equalities in both of them.*

### What is an "object"?

Some JS objects are serialized into primitive values. E.g., a `Date` object is serialized into a string via `Date.toISOString()`. We believe such objects are defined by their value, and therefore we do not track referential equality for them. The following "object" types are not tracked for referential equality:

- `Date`
- `RegExp`
- `URL`
- Typed arrays (e.g., `Uint8Array`)

This list will be extended in the future as more built-in types are supported.

*In SuperJSON, all JS objects are tracked for referential equality, regardless of their type.*

### References

In both modes, a reference is expressed as a number with `ref` type annotation. However, the number is interpreted differently in each mode:

- Simple: the number is an index in the path from root to the referenced object. The path consists of *deserialized* objects (i.e., `Map` is counted as one object, even though it is serialized to a 2D array).
- Deduplication: the number is an entity identifier, which is a unique number assigned to each object during serialization. The root object has entity identifier `0`, and each new object gets the next number. If an object (except for the root) is referenced, its entity identifier must be explicitly stored in its annotation.

## Object key order

JS has a [well-defined order](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinaryownpropertykeys) of object keys, which mostly depends on the order in which the keys were added to the object. On the contrary, in JSON, object is an unordered collection of key-value pairs. Therefore, UberJson does not guarantee that the deserialized objects will have the same key order as the original objects (arrays, sets, and maps *do* guarantee the order of their elements because they are serialized as arrays).

This has also some performance implications. When deserializing references in the *deduplication* mode, UberJson expects that any referenced object has already been deserialized, allowing it to resolve references efficiently. In practice, vast majority of tools do not change the order of the keys, so this optimization is completely safe. However, if your use case involves changing the order of the keys (e.g., [JCS](https://www.rfc-editor.org/info/rfc8785/)), you should set the `sortObjectKeys` option. There are three possible values:

- `always`: The objects will be sorted before deserialization. *This is the best option if you know there is a high probability of key order being changed.*
- `catch` (default): The objects won't be sorted, but if a reference is not found, we sort them and try again. *Choose this if you think the key order is usually preserved, but you wouldn't bet your life on it.*
- `never`: The objects won't be sorted. *Useful if you want to proactively detect any possible slowdown or if you enjoy living on the edge.*

*SuperJSON uses a completely different approach to reference serialization which doesn't depend on the order of the keys.*

## Serialization function lookup

First, all values are passed through `switch (typeof value)`. This let's UberJson immediately handle all primitive types. Only if the value is a non-null object, it looks up the serialization function in a `Map` of object prototypes. This means:

- A `while` loop is used to traverse the prototype chain, so classes that extend other classes are handled correctly. If you want to serialize deeply nested class hieararchies without this traversal, you have can explicitly register the classes for faster lookup.
- This should behave the same as `instanceof` operator, except for the [`Symbol.hasInstance`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/hasInstance) customization. If you know of a valid use case for this feature, please let us know (because we don't know of any).
- Different realms (e.g., iframes, web workers) have different prototypes (i.e., the `Date` constructor in one realm is not equal to the `Date` constructor in another realm). Therefore, serialization of objects from different realms will not work unless you explicitly register the classes from those realms.

*SuperJSON uses a linear search with `isApplicable` function for both primitive and object types, which is much slower.*

## Annotations

Annotations for properties of an object are stored in the `$` property of the object. E.g., object like `{ a: NaN }` will be serialized as:

```ts
{
    $: {
        a: 'number',
    },
    a: 'NaN',
};
```

An `Annotation` can be either a `string` (i.e., the type identifier), a `number` (i.e., the entity identifier, see [References](#references)), or an array `[string, number]` (a combination of both).

Arrays (and array-like structures, i.e., `Set` and `Map`) can also have annotations, but they are stored in an object indexed by *flat indexes*. For example, object like `{ m: new Map([ [ NaN, undefined ] ]) }` will be serialized as:

```ts
{
    $: {
        m: { 0: 'Map', 2: 'number', 3: 'undefined' },
    },
    m: [ 
        [ 'NaN', 'undefined' ],
    ],
}
```

The flat index works like this:

- The top-level array has index `0` (e.g., the map in the example).
- Its elements are traversed in DFS order, and each element has an index that is one greater than the previous element.
    - The first element of the `m` array is the array `[ 'NaN', 'undefined' ]`, which has index `1` (without any annotation).
    - The first element of that array is the string `'NaN'`, which has index `2` and is annotated as a `number`. Similarly, the `undefined` value has index `3`.

*SuperJSON uses a very different schema. All type annotations are stored in the top-level `meta.values` property, while references are in the `meta.referentialEqualities` property.*

### Version

UberJson uses different serialization algorithms for different configurations. To select a correct deserialization algorithm, the serialized data contains a version number in the `$.$` property of the root object:

```ts
{
    $: {
        $: 1,
        ...
    },
    ...
}
```

### Wrapping

Primitive values, arrays, and custom classes need to be wrapped to a plain object in order to store their annotations. For example, the `NaN` value is serialized as:

```ts
{
    $: {
        $: 1,
        wrapped: true,
        w: 'number',
    },
    w: 'NaN',
}
```
