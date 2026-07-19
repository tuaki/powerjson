import type { StringifiedPath } from './path.js';

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonMap = [JsonValue, JsonValue][];

/**
 * String represents a standard annotation that doesn't need any additional value to be parsed.
 * Otherwise, it's an array where the first value is the type and the rest are additional values needed to parse it.
 */
export type Annotation = string | [string, ...JsonValue[]];

/** If an object key is the escape key, we move its value and annotation here instead. */
export type EscapedProperty = {
    /** This has to be defined after serialization, but not necessarily during the process. */
    value?: JsonValue;
    annotation?: Annotation;
};

export type Annotations<TEscape extends string> = Record<StringifiedPath, Annotation> & { [key in TEscape]?: EscapedProperty | 'wrapped' };

export type AnnotatedJsonObject<TEscape extends string> = JsonObject & { [key in TEscape]?: Annotations<TEscape> };
