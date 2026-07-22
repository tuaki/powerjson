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
export type Annotation = string;

/** If an object key is the escape key, we move its value and annotation here instead. */
export type EscapedProperty = {
    /** This has to be defined after serialization, but not necessarily during the process. */
    value?: JsonValue;
    annotation?: Annotation;
};

export type Annotations = Record<StringifiedPath, Annotation> & { [ESCAPE_KEY]?: EscapedProperty | typeof WRAPPED_DIRECTIVE };

export type AnnotatedJsonObject = JsonObject & { [ESCAPE_KEY]?: Annotations };

export const ESCAPE_KEY = '$';
export const WRAPPED_KEY = 'w';
export const WRAPPED_DIRECTIVE = 'wrapped';

export const REFERENCE_ANNOTATION: Annotation = 'ref';
export const UNDEFINED_ANNOTATION: Annotation = 'undefined';
export const NUMBER_ANNOTATION: Annotation = 'number';
export const BIGINT_ANNOTATION: Annotation = 'bigint';
