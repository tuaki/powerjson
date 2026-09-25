import type { JsonValue, TypeId } from './json.ts';
import type { Serializer } from './serializer.ts';
import type { Deserializer } from './deserializer.ts';

// Numbers are serialized according to the [Number::toString (ES2026)](https://262.ecma-international.org/17.0/#sec-numeric-types-number-tostring) algorithm with the exception of `-0` (which is converted to "-0"` instead of `"0"`).
// Additionally, JSON doesn't support strings for numbers, so the four special string values are expressed in their string form (with extra `"`) instead of raw numbers.

const PLUS_INFINITY = 'Infinity';
const MINUS_INFINITY = '-Infinity';
const NAN = 'NaN';
const NEGATIVE_ZERO = '-0';

export function serializeNumber(value: number): number | string {
    switch (value) {
        case Infinity:
            return PLUS_INFINITY;
        case -Infinity:
            return MINUS_INFINITY;
        case 0:
            // NICE_TO_HAVE Negative zero can be solved with rawJSON.
            return (1 / value === -Infinity) ? NEGATIVE_ZERO : 0;
        default:
            return Number.isNaN(value) ? NAN : value;
    }
}

export function deserializeNumber(value: string): number {
    switch (value) {
        case PLUS_INFINITY:
            return Infinity;
        case MINUS_INFINITY:
            return -Infinity;
        case NAN:
            return NaN;
        case NEGATIVE_ZERO:
            return -0;
        default:
            throw new Error(`Invalid number value: ${value}.`);
    }
}

export type Primitive = undefined | null | string | number | boolean | bigint | symbol;

/**
 * In TS, `object` represents any non-primitive type. This means "anything that returns `object` or `function` from `typeof` except `null`".
 * In our case, we don't support functions. So, let's use this type as "`object` without functions".
 */
export type ObjectLike = object;

export type Transformer<TObject extends ObjectLike = ObjectLike, TJson extends JsonValue = JsonValue> = {
    cls: Class<TObject>;
    type: TypeId | undefined;
    /**
     * Serializes the value to a JSON value.
     * If undefined is returned, the value will be skipped from objects, sets, and maps. However, it will be kept in arrays as `null` to preserve indexes.
     * Try `JSON.stringify({ a: undefined })` and `JSON.stringify([ undefined ])` to see the difference.
     */
    serialize(value: TObject, serializer: Serializer): TJson | undefined;
    /**
     * Deserializes the value from a JSON value and a type annotation.
     */
    deserialize(value: TJson, deserializer: Deserializer): TObject;
    /**
     * Entities are subject to deduplication and circular reference detection. Values are not.
     */
    isEntity: boolean;
    /**
     * Composite types are serialized as arrays and share one composite annotation. Non-composite types are serialized as objects (and have their own annotations) or primitives.
     */
    isComposite: boolean;
};

type Class<T> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is needed for `new` operator. Nothing else really works.
    new (...args: any[]): T;
} | {
    // This should be enough to allow classes with private constructors. The best we can do is hope.
    prototype: T;
    name: string;
};

/**
 * Utility function for defining transformers.
 * Automatically infers the types of `TObject` and `TJson` from the provided functions.
 */
export function transformer<TObject extends ObjectLike, TJson extends JsonValue>(options: {
    cls: Class<TObject>;
    type: TypeId | undefined;
    serialize: (value: TObject, serializer: Serializer) => TJson | undefined;
    deserialize: (value: TJson, deserializer: Deserializer) => TObject;
    isEntity?: boolean;
    isComposite?: boolean;
}): Transformer<TObject, TJson> {
    return {
        isEntity: false,
        isComposite: false,
        ...options,
    };
}

// `String(value)` is different from `value.toString()`.
// For primitive types, the first one should be, in general, faster. So we use it for stringifying indexes and so on.
// For objects, the first one can be overriden by `Symbol.toPrimitive` or `valueOf`. The second one can be overriden as well ... however, we decided on the second one because it is more explicit and less likely to be overriden.
//
// Contrary to superjson, we don't think built-in types should not be deduplicated by default. They are usually immutable and don't contain other values.

// #region Containers

const plainObjectTransformer = transformer({
    cls: Object as unknown as Class<PlainObject>,
    type: undefined,
    serialize: (value, serializer) => serializer.serializePlainObject(value),
    deserialize: (value, deserializer) => deserializer.deserializePlainObject(value),
    isEntity: true,
});

/**
 * We should check object keys whenever we directly write to them like `object[key] = ...`.
 * see https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
 *
 * This is strictly speaking not needed during serialization, but we don't want to accicentaly create a json that we won't be able to deserialize. So, we check it during serialization as well.
 */
export function validateObjectKeyForPrototypePollution(key: string) {
    // In theory, this should not be needed - the patterns for PP are:
    // - `object['__proto__'][x] = ...`
    // - `object['constructor']['prototype'][x] = ...`
    // Our algorithms never do that - we always create the intermediate objects/values which we assing like `object[key] = ...`.
    // However, allowing these keys is still potentially harmful because they might produce objects like `{ constructor: { prototype: { x: ... } } }` which can later, when merged by a naive algorithm, cause PP.
    // So, there is no good reason to allow these keys.
    // Like we probably could allow `prototype` since there should be no way how to reach `Object.prototype` without the first two keys, but better safe than sorry.
    // E.g.,
    // ```ts
    // function Foo() {}
    // const object = { Foo };
    // ```
    // gives us `object['Foo']['prototype']`, which is the prototype of all objects created with `new Foo()`, allowing us to alter all of them. So no, thank you.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        throw new Error(`Invalid object key: ${key}. Remove it to avoid prototype pollution.`);
}

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
    if (typeof value !== 'object' || value === null)
        return false;

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

const arrayTransformer = transformer({
    cls: Array,
    type: undefined,
    serialize: (value, serializer) => serializer.serializeArray(value),
    deserialize: (value, deserializer) => deserializer.deserializeArray(value),
    isEntity: true,
    isComposite: true,
});

const setTransformer = transformer({
    cls: Set,
    type: 'Set',
    serialize: (value, serializer) => serializer.serializeSet(value),
    deserialize: (value, deserializer) => deserializer.deserializeSet(value),
    isEntity: true,
    isComposite: true,
});

const mapTransformer = transformer({
    cls: Map,
    type: 'Map',
    serialize: (value, serializer) => serializer.serializeMap(value),
    deserialize: (value, deserializer) => deserializer.deserializeMap(value),
    isEntity: true,
    isComposite: true,
});

// #endregion
// #region Predefined types

const dateTransformer = transformer({
    cls: Date,
    type: 'Date',
    serialize: value => {
        // Date can be invalid; let's serialize it as null.
        return isNaN(+value) ? null : value.toISOString();
    },
    deserialize: value => {
        return new Date(value === null ? NaN : value);
    },
});

// TODO Add support for Temporal

const regexpTransformer = transformer({
    cls: RegExp,
    type: 'RegExp',
    serialize: value => {
        // Returns a string in the form of `/pattern/flags`.
        return value.toString();
    },
    deserialize: value => {
        const body = value.slice(1, value.lastIndexOf('/'));
        const flags = value.slice(value.lastIndexOf('/') + 1);
        return new RegExp(body, flags);
    },
});

const urlTransformer = transformer({
    cls: URL,
    type: 'URL',
    serialize: value => {
        return value.toString();
    },
    deserialize: value => {
        return new URL(value);
    },
});

// The ES2026 standard defines these specialization of errors:
// - [NativeError](https://262.ecma-international.org/17.0/#sec-nativeerror-object-structure) (several subtypes, see below)
//
// We support all of them according to the [html serialization algorithm](https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal).
// - The `stack` property is not included unless explicitly allowed.
// - The `cause` property (not part of the html algorithm) is included by default.
//
// NICE_TO_HAVE
// [AggregateError](https://262.ecma-international.org/17.0/#sec-aggregate-error-objects) is not supported yet because it's not in the html algorithm. However, there is a [PR](https://github.com/whatwg/html/pull/5749) so let's hope it will be merged soon.
// [SupressedError](https://tc39.es/ecma262/#sec-suppressederror-objects) is not yet in the current standard (ES2026).

const errorTransformer = transformer({
    cls: Error,
    type: 'Error',
    serialize: (value, serializer) => {
        // The default `Error` properties aren't enumerable. So, we need to explicitly copy them to a plain object.
        // There might be other non-standard properties (e.g., `lineNumber` in Firefox) but we probably don't want to expose them.

        // This seems complicated, but the algorithm does it this way.
        let message: string | undefined;
        const descriptor = Object.getOwnPropertyDescriptor(value, 'message');
        if (descriptor !== undefined && 'value' in descriptor)
            message = String(descriptor.value);

        const valueName = value.name;
        const name = nativeErrorConstructorsByName.has(valueName) ? valueName : 'Error';

        const plainObject: PlainObject = {
            name,
            message,
        };

        if (serializer.config.allowStackInError)
            plainObject.stack = value.stack;

        // Copy `cause` only if it exists (the classical difference between `undefined` and "not defined" strikes again).
        if ('cause' in value)
            plainObject.cause = value.cause;

        const keys = Object.keys(value);
        const keysLength = keys.length;
        for (let i = 0; i < keysLength; i++) {
            const key = keys[i];
            // No need to validate for prototype pollution here because we will do that in `serializePlainObject` anyway.
            if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause')
                continue;

            plainObject[key] = value[key as keyof typeof value];
        }

        return serializer.serializePlainObject(plainObject);
    },
    deserialize: (value, deserializer) => {
        const { name, message, ...rest } = value;
        const constructor = nativeErrorConstructorsByName.get(name as string) ?? Error;

        // If the message was undefined, it was serialized as `null`, so we convert it back to undefined. Otherwise, it must be a string.
        const error = new constructor(message as string | null ?? undefined);

        deserializer.deserializePlainObject(rest, error);

        // `cause` is a non-enumerable property. Normally, we would pass it through the constructor, but we can't do that because we have to deserialize it first, and for that, the error has to be already instantiated and registered as a reference target.
        // Also, `undefined` vs "not defined" strikes again.
        if ('cause' in error) {
            Object.defineProperty(error, 'cause', {
                writable: true,
                enumerable: false,
                configurable: true,
            });
        }

        // If stack is missing, we still want to override the default stack trace (which would point to the `new constructor()` call above).
        if (!('stack' in value))
            error.stack = undefined;

        return error;
    },
    isEntity: true,
});

// See https://262.ecma-international.org/17.0/#sec-native-error-types-used-in-this-standard.
const nativeErrorConstructors = [
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
];
const nativeErrorConstructorsByName = new Map(nativeErrorConstructors.map(constructor => [ constructor.name, constructor ]));

export const baseTransformers = [
    plainObjectTransformer,
    arrayTransformer,
    setTransformer,
    mapTransformer,
    dateTransformer,
    regexpTransformer,
    urlTransformer,
    errorTransformer,
];

const typedArrayConstructors = [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    // NICE_TO_HAVE Remove this once the support is universal.
    ...(typeof Float16Array !== 'undefined' ? [ Float16Array ] : []),
    Float32Array,
    Float64Array,
    ...(typeof BigInt64Array !== 'undefined' ? [ BigInt64Array ] : []),
    ...(typeof BigUint64Array !== 'undefined' ? [ BigUint64Array ] : []),
];

type TypedArray = InstanceType<typeof typedArrayConstructors[number]>;

const BASE64_ALPHABET = 'base64url';

export const typedArrayTransformers = typedArrayConstructors.map(cls => transformer({
    cls,
    type: cls.name,
    serialize: (value: TypedArray) => {
        // Only Uint8Array has a built-in base64 methods.
        //
        // The platform's endianness matters. The specs don't require a particular endianness for typed arrays. However, all mainstream JS engines use little-endian so we should be fine.
        // We could use `DataView` to read the bytes in a specific endianness, but that would be probably slower so let's not do that for now.
        const uint8Array = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return uint8Array.toBase64({ alphabet: BASE64_ALPHABET });
    },
    deserialize: value => {
        const bytes = Uint8Array.fromBase64(value, { alphabet: BASE64_ALPHABET });
        // Gotcha! The typed arrays expose `byteLength` in bytes, but their constructors expect the length in elements.
        return new cls(bytes.buffer, bytes.byteOffset, bytes.byteLength / cls.BYTES_PER_ELEMENT);
    },
}));

// #endregion
