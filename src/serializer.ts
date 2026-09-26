import { BIGINT_ANNOTATION, ESCAPE_CHAR, escapeKey, NUMBER_ANNOTATION, SYMBOL_ANNOTATION, UNDEFINED_ANNOTATION, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AnnotatedJsonObject, type Annotations, type CompositeAnnotation, type EntityId, type JsonArray, type JsonMap, type JsonValue, type RootAnnotations, type SerializedValue, type TypeId } from './json.ts';
import { isPlainObject, serializeNumber, validateObjectKeyForPrototypePollution, type ObjectLike, type PlainObject } from './transformers.ts';
import type { PowerJsonConfig } from './config.ts';

/**
 * Key of the root value in the annotations.
 * The value was chosen to be equal to the argument passed to the `toJSON` method if called on the root value.
 */
const ROOT_KEY = '';

export abstract class Serializer {
    readonly config: PowerJsonConfig;

    constructor(config: PowerJsonConfig) {
        this.config = config;
    }

    serialize(input: unknown): SerializedValue {
        const rootAnnotations = this.annotations;

        let serialized = this.serializeUnknown(input);

        this.finalizeAnnotations();

        let output: SerializedValue;
        let annotations: SerializedValue[typeof ESCAPE_CHAR];

        let isRootKeyInAnnotations = ROOT_KEY in rootAnnotations;
        if (isRootKeyInAnnotations || !isPlainObject(serialized)) {
            // We have to wrap the serialized value in a wrapper object.
            if (serialized === undefined) {
                // This is a very strange edge case that shouldn't really happen unless someone tries to serialize sth like function or creates a custom transformer that returns `undefined` for the root value.
                // Let's just serialize it as `undefined` and move on. We only add the undefined annotation if needed tho.
                serialized = null;
                rootAnnotations[ROOT_KEY] = rootAnnotations[ROOT_KEY] ?? UNDEFINED_ANNOTATION;
                isRootKeyInAnnotations = true;
            }

            annotations = {
                [ESCAPE_CHAR]: this.config.version,
                [WRAPPED_DIRECTIVE]: true,
            };

            if (isRootKeyInAnnotations)
                annotations[WRAPPED_KEY] = rootAnnotations[ROOT_KEY];

            output = {
                [WRAPPED_KEY]: serialized,
                [ESCAPE_CHAR]: annotations,
            };
        }
        else {
            // No wrapping needed - let's just make sure the root annotations exists so that we can add the algorithm version to it.
            output = serialized as SerializedValue;
            annotations = output[ESCAPE_CHAR];
            if (annotations === undefined) {
                annotations = {} as RootAnnotations;
                output[ESCAPE_CHAR] = annotations;
            }
        }

        // In both cases, we need to add the algorithm version to the annotations.
        annotations[ESCAPE_CHAR] = this.config.version;

        return output;
    }

    /** Hook that gets called after all objects have been serialized. */
    protected abstract finalizeAnnotations(): void;

    // #region Context

    protected annotations: Annotations = {};
    protected key: string = ROOT_KEY;
    /**
     * If we are directly in a composite (array with any nesting level), this is its index.
     * It's basically a flat index (all nesting levels share the same counter). The top-level array has index 0.
     */
    protected compositeIndex: number | undefined;

    // #endregion
    // #region Annotations

    protected addAnnotation(typeId: TypeId): void {
        const key = this.key;

        if (this.compositeIndex === undefined) {
            // No need to check for an old composite since we are not nested in any array, so no composite can exist yet.
            this.annotations[key] = typeId;
        }
        else {
            let composite = this.annotations[key] as CompositeAnnotation | undefined;
            if (composite === undefined) {
                composite = {};
                this.annotations[key] = composite;
            }

            composite[this.compositeIndex] = typeId;
        }
    }

    /** Store object and its empty annotations for later processing (if needed). */
    protected abstract storeEmptyAnnotation(value: AnnotatedJsonObject, annotations: Annotations): void;

    // #endregion
    // #region References

    protected abstract trySetReference(value: unknown): EntityId | undefined;

    protected abstract cleanupReference(): void;

    // #endregion
    // #region Objects

    // The overload is here for better DX when defining custom transformers (so that we don't have to cast the value to `PlainObject`).

    serializePlainObject<TObject extends ObjectLike>(value: TObject): AnnotatedJsonObject;
    serializePlainObject(value: PlainObject): AnnotatedJsonObject {
        const prevAnnotations = this.annotations;
        const prevKey = this.key;
        const prevCompositeIndex = this.compositeIndex;

        // Context switch

        // Explicitly creating the annotations also forces the escape key to be in the first position of each object. This is just a visual thing, but it makes it easier to read the output.
        // If not needed, the annotations will be deleted later.
        const annotations: Annotations = {};
        const output: AnnotatedJsonObject = {};
        this.annotations = annotations;

        const keys = Object.keys(value);
        const length = keys.length;
        for (let i = 0; i < length; i++) {
            let key = keys[i];
            const item = value[key];

            validateObjectKeyForPrototypePollution(key);

            // No need to check for symbol keys here since `Object.keys` doesn't return them.

            if (key[0] === ESCAPE_CHAR)
                key = escapeKey(key);

            this.key = key;
            this.compositeIndex = undefined;

            const serializedItem = this.serializeUnknown(item);
            if (serializedItem === undefined) {
                // `undefined` is an escape hatch for skip. Also, `JSON.stringify({ a: undefined })` returns `{}`.
                continue;
            }

            output[key] = serializedItem;
        }

        if (isAnnotationsNotEmpty(annotations))
            output[ESCAPE_CHAR] = annotations;
        else
            this.storeEmptyAnnotation(output, annotations);

        // Context switch

        this.annotations = prevAnnotations;
        this.key = prevKey;
        this.compositeIndex = prevCompositeIndex;

        return output;
    }

    // #endregion
    // #region Arrays

    serializeArray(value: unknown[]): JsonArray {
        const length = value.length;
        const output: JsonArray = Array(length);
        for (let i = 0; i < length; i++)
            // Arrays must preserve indexes. So, we decided to keep `undefined` as `null`. Also, `JSON.stringify([ undefined ])` returns `[ null ]`.
            output[i] = this.serializeArrayElement(value[i]) ?? null;

        return output;
    }

    serializeSet(value: Set<unknown>): JsonArray {
        const output: JsonArray = Array(value.size);
        let i = 0;
        for (const item of value) {
            const serializedItem = this.serializeArrayElement(item);
            if (serializedItem !== undefined) {
                // Sets are not indexed, so `undefined` means skip.
                output[i] = serializedItem;
                i++;
            }
        }

        return output;
    }

    serializeMap(value: Map<unknown, unknown>): JsonMap {
        const output: JsonMap = Array(value.size);
        let i = 0;
        for (const [ key, item ] of value) {
            // In theory, we don't have to increment the composite index here if we also didn't increment it in the deserializer. However, in some cases (e.g., when sorting json object keys), we have to iterate over the indexes without the type information. So, this inconsistency just isn't worth it.
            //
            // Map is also an array so the composite index must be defined here.
            this.compositeIndex!++;

            const serializedKey = this.serializeArrayElement(key);
            const serializedItem = this.serializeArrayElement(item);

            if (serializedKey !== undefined && serializedItem !== undefined) {
                // Maps are not indexed, so `undefined` means skip.
                output[i] = [ serializedKey, serializedItem ];
                i++;
            }
        }

        return output;
    }

    private serializeArrayElement(value: unknown): JsonValue | undefined {
        // In arrays, composite index must be defined.
        this.compositeIndex!++;
        return this.serializeUnknown(value);
    }

    // #endregion
    // #region Transformers

    /** Returns `undefined` if the value should be skipped. This doesn't work everywhere, though (e.g., in arrays). */
    private serializeUnknown(value: unknown, checkToJson = true): JsonValue | undefined {
        switch (typeof value) {
            case 'string':
            case 'boolean':
                return value;
            case 'undefined':
                this.addAnnotation(UNDEFINED_ANNOTATION);
                return null;
            case 'number': {
                const serialized = serializeNumber(value);
                if (typeof serialized === 'string')
                    this.addAnnotation(NUMBER_ANNOTATION);

                return serialized;
            }
            case 'bigint':
                // NICE_TO_HAVE There is a new approach in ES2026 which already works mostly everywhere, but we should probably just convert it to a string for now.
                this.addAnnotation(BIGINT_ANNOTATION);
                return String(value);
            case 'symbol': {
                const serialized = this.config.getSymbolId(value);
                if (serialized !== undefined)
                    this.addAnnotation(SYMBOL_ANNOTATION);

                return serialized;
            }
            case 'object':
                return value === null ? null : this.serializeObjectLike(value, checkToJson);
            case 'function':
                // This ain't gonna happen.
                return undefined;
        }
    }

    private serializeObjectLike(value: ObjectLike, checkToJson: boolean): JsonValue | undefined {
        const transformer = this.config.getObjectTransformer(value);
        if (transformer.useToJSON && checkToJson && 'toJSON' in value && typeof value.toJSON === 'function') {
            const key = this.compositeIndex === undefined
                ? this.key
                // Yes, we should use an index in the actual array this value is in. But that would introduce another overhead which, at this point, is probably not worth it.
                // Besides that, in a complex array structure (e.g., maps), a composite index probably better represents the "context" of the value than the index in the actual array.
                : String(this.compositeIndex);

            const plainValue = (value.toJSON as (key: string) => unknown)(key);
            return this.serializeUnknown(plainValue, false);
        }

        if (transformer.isComposite && this.compositeIndex === undefined)
            this.compositeIndex = 0;

        if (transformer.isEntity) {
            const reference = this.trySetReference(value);
            if (reference !== undefined)
                return reference;
        }

        if (transformer.type !== undefined)
            this.addAnnotation(transformer.type);

        const output = transformer.serialize(value, this);

        if (transformer.isEntity)
            this.cleanupReference();

        return output;
    }

    // #endregion
}

export function isAnnotationsNotEmpty(annotations: Annotations): boolean {
    // We want to check if the escape key is empty. This should be faster than Object.keys(...).length === 0 because the first operation has to first create an array of all keys.
    for (const _ in annotations)
        return true;

    return false;
}
