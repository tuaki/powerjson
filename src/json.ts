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

/** The wrapped directive can be only on the root. No need to check for it elsewhere. */
export type Annotations = Record<string, Annotation | CompositeAnnotation> & { [ESCAPE_CHAR]?: typeof WRAPPED_DIRECTIVE };

export type AnnotatedJsonObject = JsonObject & { [ESCAPE_CHAR]?: Annotations };

/** For efficient escaping, this has to be a single character. */
export const ESCAPE_CHAR = '$';

/**
 * The key will be escaped if it consist of only `$`. In that case, one more `$` will be added to the end of the key.
 * @param key Is expected to start with `$` (this should be already checked before calling this function).
 */
export function escapeKey(key: string): string {
    const length = key.length;
    for (let i = 1; i < length; i++) {
        if (key[i] !== ESCAPE_CHAR)
            // The key doesn't need to be escaped.
            return key;
    }

    // Let's not cache all possible sequences. If someone uses garbake like that, it's on him.
    return escapeKeyCache[length] ?? (key + ESCAPE_CHAR);
}

/**
 * The key will be unescaped if it consist of only `$`. In that case, one `$` will be removed from the end of the key.
 * @param key Is expected to start with `$` and have length greater than 1 (this should be already checked before calling this function).
 */
export function unescapeKey(key: string): string {
    const length = key.length;
    for (let i = 1; i < length; i++) {
        if (key[i] !== ESCAPE_CHAR)
            // The key doesn't need to be unescaped.
            return key;
    }

    return unescapeKeyCache[length] ?? (key.slice(0, -1));
}

const escapeKeyCache = Array.from({ length: 10 }, (_, i) => ESCAPE_CHAR.repeat(i + 1));
// Yes, the 0th and 1st elements are undefined. But we don't want to use them, because escaped keys must have length greater than 1.
const unescapeKeyCache = Array.from({ length: 10 }, (_, i) => escapeKeyCache[i - 2]);

export const WRAPPED_KEY = 'w';
export const WRAPPED_DIRECTIVE = 'wrapped';

export const REFERENCE_ANNOTATION: TypeId = 'ref';
export const UNDEFINED_ANNOTATION: TypeId = 'undefined';
export const NUMBER_ANNOTATION: TypeId = 'number';
export const BIGINT_ANNOTATION: TypeId = 'bigint';
