import type { Annotation, JsonArray, JsonMap, JsonObject, JsonValue } from './json.js';
import type { Deserializer } from './deserializer.js';
import type { Serializer } from './serializer.js';

export type Primitive = undefined | null | string | number | boolean | bigint | symbol;

/**
 * In TS, `object` represents any non-primitive type. This means "anything that returns `object` or `function` from `typeof` except `null`".
 * In our case, we don't support functions. So, let's use this types as "`object` without functions".
 */
export type ObjectLike = object;

export type Constructor<T = unknown> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is needed for `new` operator. Nothing else really works.
    new (...args: any[]): T;
};

export type Transformer<TObject extends ObjectLike = ObjectLike> = {
    // TODO Use the type or its prototype?
    type: Constructor<TObject>;
    annotation: string | undefined;
    /**
     * Reference types are subject to deduplication and circular reference detection. Value types are not.
     */
    isReferenceType: boolean;
    /**
     * Serializes the value to a JSON value.
     * If undefined is returned, the value will be skipped from objects, sets, and maps. However, it will be kept in arrays as `null` to preserve indexes.
     * Try `JSON.stringify({ a: undefined })` and `JSON.stringify([ undefined ])` to see the difference.
     */
    serialize(value: TObject, serializer: Serializer): JsonValue | undefined;
    /**
     * Deserializes the value from a JSON value and an annotation.
     */
    deserialize(value: JsonValue, annotation: Annotation, deserializer: Deserializer): TObject;
};

function transformer<TObject extends ObjectLike, TJson extends JsonValue>(
    type: Constructor<TObject>,
    annotation: string | undefined,
    isReferenceType: boolean,
    serialize: (value: TObject, serializer: Serializer) => TJson | undefined,
    deserialize: (value: TJson, annotation: Annotation, deserializer: Deserializer) => TObject,
): Transformer<TObject> {
    return {
        type,
        annotation,
        isReferenceType,
        serialize,
        deserialize,
    };
}

// `String(value)` is different from `value.toString()`.
// For primitive types, the first one should be, in general, faster. So we use it for stringifying indexes and so on.
// For objects, the first one can be overriden by `Symbol.toPrimitive` or `valueOf`. The second one can be overriden as well ... however, we decided on the second one because it is more explicit and less likely to be overriden.
//
// Contrary to superjson, we don't think built-in types should not be deduplicated by default. They are usually immutable and don't contain other values.

// #region Containers

const plainObjectTransformer = transformer(
    // NICE_TO_HAVE Not pretty.
    Object as unknown as Constructor<Record<string, unknown>>,
    undefined,
    true,
    (value: Record<string, unknown>, serializer: Serializer) => serializer.serializePlainObject(value),
    (value: JsonObject, _: Annotation, deserializer: Deserializer) => deserializer.deserializePlainObject(value),
);

/**
 * We should check object keys whenever we directly write to them like `object[key] = ...`.
 * see https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
 */
export function validateObjectKey(key: string) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        throw new Error(`Invalid object key: ${key}. Remove it to avoid prototype pollution.`);
}

const arrayTransformer = transformer(
    Array,
    undefined,
    true,
    (value: unknown[], serializer: Serializer) => serializer.serializeArray(value),
    (value: JsonArray, _: Annotation, deserializer: Deserializer) => deserializer.deserializeArray(value),
);

const setTransformer = transformer(
    Set,
    'Set',
    true,
    (value: Set<unknown>, serializer: Serializer) => serializer.serializeSet(value),
    (value: JsonArray, _: Annotation, deserializer: Deserializer) => deserializer.deserializeSet(value),
);

const mapTransformer = transformer(
    Map,
    'Map',
    true,
    (value: Map<unknown, unknown>, serializer: Serializer) => serializer.serializeMap(value),
    (value: JsonMap, _: Annotation, deserializer: Deserializer) => deserializer.deserializeMap(value),
);

// #endregion
// #region Predefined types

const dateTransformer = transformer(
    Date,
    'Date',
    false,
    (value: Date): string | null => {
        // Date can be invalid; let's serialize it as null.
        return isNaN(+value) ? null : value.toISOString();
    },
    (value: string | null): Date => {
        return new Date(value === null ? NaN : value);
    },
);

const regexpTransformer = transformer(
    RegExp,
    'RegExp',
    false,
    (value: RegExp): string => {
        // Returns a string in the form of `/pattern/flags`.
        return value.toString();
    },
    (value: string): RegExp => {
        const body = value.slice(1, value.lastIndexOf('/'));
        const flags = value.slice(value.lastIndexOf('/') + 1);
        return new RegExp(body, flags);
    },
);

const urlTransformer = transformer(
    URL,
    'URL',
    false,
    (value: URL): string => {
        return value.toString();
    },
    (value: string): URL => {
        return new URL(value);
    },
);

// TODO Temporal
// TODO Error

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
    ...(typeof Float16Array !== 'undefined' ? [ Float16Array ] : []),
    Float32Array,
    Float64Array,
    ...(typeof BigInt64Array !== 'undefined' ? [ BigInt64Array ] : []),
    ...(typeof BigUint64Array !== 'undefined' ? [ BigUint64Array ] : []),
];

type TypedArray = InstanceType<typeof typedArrayConstructors[number]>;

const BASE64_ALPHABET = 'base64url';

export const typedArrayTransformers = typedArrayConstructors.map(constructor => transformer(
    constructor,
    constructor.name,
    false,
    (value: TypedArray) => {
        // Only Uint8Array has a built-in base64 methods.
        //
        // The platform's endianness matters. The specs don't require a particular endianness for typed arrays. However, all mainstream JS engines use little-endian so we should be fine.
        // We could use `DataView` to read the bytes in a specific endianness, but that would be probably slower so let's not do that for now.
        const uint8Array = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return uint8Array.toBase64({ alphabet: BASE64_ALPHABET });
    },
    (value: string) => {
        const bytes = Uint8Array.fromBase64(value, { alphabet: BASE64_ALPHABET });
        // Gotcha! The typed arrays expose `byteLength` in bytes, but their constructors expect the length in elements.
        return new constructor(bytes.buffer, bytes.byteOffset, bytes.byteLength / constructor.BYTES_PER_ELEMENT);
    },
));

// #endregion
