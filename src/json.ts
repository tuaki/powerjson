import type { StringifiedPath } from './path.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * String represents a standard annotation that doesn't need any additional value to be parsed.
 * Otherwise, it's an array where the first value is the type and the rest are additional values needed to parse it.
 */
export type Annotation = string | [string, ...JsonValue[]];

export type ControlObject = {
    /** If the top-level value isn't a plain object, we have to wrap it (and then unwrap it) */
    isWrapped?: boolean;
    /** If an object key is the escape key, we move it here instead. */
    value?: JsonValue;
    /** If the value needs annotation, we store it here. */
    annotation?: Annotation;
};

export type Annotations<TEscape extends string> = Record<StringifiedPath, Annotation> & { [key in TEscape]?: ControlObject };

export type AnnotatedJsonObject<TEscape extends string> = JsonObject & { [key in TEscape]?: Annotations<TEscape> };
