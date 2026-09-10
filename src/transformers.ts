import type { JsonValue, TypeId } from './json.ts';
import type { Serializer } from './serializer.ts';
import type { Deserializer } from './deserializer.ts';

// Numbers are serialized according to the Section 7.1.12.1 of the [ECMA 262](https://www.ecma-international.org/ecma-262/10.0/index.html) standard with the exception of `-0` (which is converted to "-0"` instead of `"0"`).
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
    clazz: Clazz<TObject>;
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

type Clazz<T> = {
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
    clazz: Clazz<TObject>;
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
    clazz: Object as unknown as Clazz<Record<string, unknown>>,
    type: undefined,
    serialize: (value, serializer) => serializer.serializePlainObject(value),
    deserialize: (value, deserializer) => deserializer.deserializePlainObject(value),
    isEntity: true,
});

/**
 * We should check object keys whenever we directly write to them like `object[key] = ...`.
 * see https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
 */
export function validateObjectKey(key: string) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        throw new Error(`Invalid object key: ${key}. Remove it to avoid prototype pollution.`);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null)
        return false;

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

const arrayTransformer = transformer({
    clazz: Array,
    type: undefined,
    serialize: (value, serializer) => serializer.serializeArray(value),
    deserialize: (value, deserializer) => deserializer.deserializeArray(value),
    isEntity: true,
    isComposite: true,
});

const setTransformer = transformer({
    clazz: Set,
    type: 'Set',
    serialize: (value, serializer) => serializer.serializeSet(value),
    deserialize: (value, deserializer) => deserializer.deserializeSet(value),
    isEntity: true,
    isComposite: true,
});

const mapTransformer = transformer({
    clazz: Map,
    type: 'Map',
    serialize: (value, serializer) => serializer.serializeMap(value),
    deserialize: (value, deserializer) => deserializer.deserializeMap(value),
    isEntity: true,
    isComposite: true,
});

// #endregion
// #region Predefined types

const dateTransformer = transformer({
    clazz: Date,
    type: 'Date',
    serialize: value => {
        // Date can be invalid; let's serialize it as null.
        return isNaN(+value) ? null : value.toISOString();
    },
    deserialize: value => {
        return new Date(value === null ? NaN : value);
    },
});

const regexpTransformer = transformer({
    clazz: RegExp,
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
    clazz: URL,
    type: 'URL',
    serialize: value => {
        return value.toString();
    },
    deserialize: value => {
        return new URL(value);
    },
});

// TODO Add support for Temporal
// TODO Add support for Error

export const baseTransformers = {
    plainObject: plainObjectTransformer,
    array: arrayTransformer,
    set: setTransformer,
    map: mapTransformer,
    date: dateTransformer,
    regexp: regexpTransformer,
    url: urlTransformer,
};

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

export const typedArrayTransformers = typedArrayConstructors.map(clazz => transformer({
    clazz,
    type: clazz.name,
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
        return new clazz(bytes.buffer, bytes.byteOffset, bytes.byteLength / clazz.BYTES_PER_ELEMENT);
    },
}));

// #endregion
