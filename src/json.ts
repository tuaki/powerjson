export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonPrimitive = string | number | boolean | null;
export type JsonEntity = JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonMap = [JsonValue, JsonValue][];

export type TypeId = string;
export type EntityId = number;

export type Annotation = TypeId | EntityId | [TypeId, EntityId];
export type CompositeAnnotation = Record<number, Annotation>;

/** If an object key is the escape key, we move its value and annotation here instead. */
export type EscapedProperty = {
    value: JsonValue;
    annotation: Annotation | CompositeAnnotation;
};

/** The wrapped directive can be only on the root. No need to check for it elsewhere. */
export type Annotations = Record<string, Annotation | CompositeAnnotation> & { [ESCAPE_KEY]?: EscapedProperty | typeof WRAPPED_DIRECTIVE };

export type AnnotatedJsonObject = JsonObject & { [ESCAPE_KEY]?: Annotations };

export const ESCAPE_KEY = '$';
export const WRAPPED_KEY = 'w';
export const WRAPPED_DIRECTIVE = 'wrapped';

export const REFERENCE_ANNOTATION: TypeId = 'ref';
export const UNDEFINED_ANNOTATION: TypeId = 'undefined';
export const NUMBER_ANNOTATION: TypeId = 'number';
export const BIGINT_ANNOTATION: TypeId = 'bigint';
