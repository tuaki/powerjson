import { BIGINT_ANNOTATION, ESCAPE_KEY, NUMBER_ANNOTATION, UNDEFINED_ANNOTATION, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AnnotatedJsonObject, type Annotations, type CompositeAnnotation, type EntityId, type EscapedProperty, type JsonArray, type JsonMap, type JsonObject, type JsonValue, type TypeId } from './json.js';
import { isPlainObject, serializeNumber, validateObjectKey, type ObjectLike } from './transformers.js';
import type { UberJson } from './uberJson.js';
import { ensureProperty } from './utils.js';

export abstract class Serializer {
    readonly uberJson: UberJson;

    constructor(uberJson: UberJson) {
        this.uberJson = uberJson;
    }

    serialize(value: unknown): JsonObject {
        // If the top-level value isn't a plain object, we have to wrap it so that it can put its annotations somewhere.
        const isWrapped = !isPlainObject(value);

        const input = isWrapped ? { [WRAPPED_KEY]: value } : value;
        this.trySetReference(input);
        const serialized = this.serializePlainObject(input);

        if (isWrapped) {
            const annotations = ensureProperty(serialized, ESCAPE_KEY, {});
            annotations[ESCAPE_KEY] = WRAPPED_DIRECTIVE;
        }

        return serialized;
    }

    // #region Context

    // This is defined after the first call to `serializePlainObject` so it's essentially always defined.
    protected annotations!: Annotations;
    /** Undefined for the root level, defined otherwise. */
    protected key: string | undefined;
    /**
     * If we are directly in a composite (array with any nesting level), this is its index.
     * It's basically a flat index (all nesting levels share the same counter). The top-level array has index 0.
     */
    protected compositeIndex: number | undefined;

    // #endregion
    // #region Annotations

    protected addAnnotation(typeId: TypeId): void {
        // At this point, the key must be defined - we can't add annotations on the root level (the root is always a plain object).
        const key = this.key!;

        if (this.compositeIndex === undefined) {
            // No need to check for an old composite since we are not nested in any array, so no composite can exist yet.
            if (key === ESCAPE_KEY)
                this.getEscapedProperty().annotation = typeId;
            else
                this.annotations[key] = typeId;
        }
        else {
            let composite: CompositeAnnotation | undefined;

            if (key === ESCAPE_KEY) {
                const escapedProperty = this.getEscapedProperty();
                composite = escapedProperty.annotation as CompositeAnnotation | undefined;
                if (composite === undefined) {
                    composite = {};
                    escapedProperty.annotation = composite;
                }
            }
            else {
                composite = this.annotations[key] as CompositeAnnotation | undefined;
                if (composite === undefined) {
                    composite = {};
                    this.annotations[key] = composite;
                }
            }

            composite[this.compositeIndex] = typeId;
        }
    }

    private getEscapedProperty(): Partial<EscapedProperty> {
        return ensureProperty(this.annotations as Record<string, unknown>, ESCAPE_KEY, {}) as Partial<EscapedProperty>;
    }

    /** Clears annotations from the object if they are not needed. */
    protected abstract cleanupAnnotations(value: AnnotatedJsonObject): void;

    // #endregion
    // #region References

    protected abstract trySetReference(value: unknown): EntityId | undefined;

    protected abstract cleanupReference(): void;

    // #endregion
    // #region Objects

    serializePlainObject(value: Record<string, unknown>): AnnotatedJsonObject {
        const prevAnnotations = this.annotations;
        const prevKey = this.key;
        const prevCompositeIndex = this.compositeIndex;

        // Context switch

        // Explicitly creating the annotations also forces the escape key to be in the first position of each object. This is just a visual thing, but it makes it easier to read the output.
        // If not needed, the annotations will be deleted later.
        const output: AnnotatedJsonObject = { [ESCAPE_KEY]: {} };
        this.annotations = output[ESCAPE_KEY]!;
        let hasEscapedProperty = false;

        for (const [ key, item ] of Object.entries(value)) {
            validateObjectKey(key);

            if (key === ESCAPE_KEY) {
                hasEscapedProperty = true;
                continue;
            }

            this.key = key;
            this.compositeIndex = undefined;

            const serializedItem = this.serializeUnknown(item);
            if (serializedItem === undefined) {
                // `undefined` is an escape hatch for skip. Also, `JSON.stringify({ a: undefined })` returns `{}`.
                continue;
            }

            output[key] = serializedItem;
        }

        // We must serialize this after all other properties because we need a well-defined order of the keys in the object.
        // Since the escaped property must be stored on the escape key, we must process it either first or last. We decided to do it last because it's easier to implement.
        if (hasEscapedProperty) {
            this.key = ESCAPE_KEY;
            this.compositeIndex = undefined;
            const serializedItem = this.serializeUnknown(value[ESCAPE_KEY]);
            if (serializedItem !== undefined)
                this.getEscapedProperty().value = serializedItem;
        }

        this.cleanupAnnotations(output);

        // Context switch

        this.annotations = prevAnnotations;
        this.key = prevKey;
        this.compositeIndex = prevCompositeIndex;

        return output;
    }

    // #endregion
    // #region Arrays

    serializeArray(value: unknown[]): JsonArray {
        const output: JsonArray = Array(value.length);
        for (let i = 0; i < value.length; i++)
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
    private serializeUnknown(value: unknown): JsonValue | undefined {
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
            case 'object':
                return value === null ? null : this.serializeObjectLike(value);
            case 'symbol':
                // TODO Add support for Symbol
                return undefined;
            case 'function':
                // This ain't gonna happen.
                return undefined;
        }
    }

    private serializeObjectLike(value: ObjectLike): JsonValue | undefined {
        const transformer = this.uberJson.getTransformerForObject(value);

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
