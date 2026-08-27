import { BIGINT_ANNOTATION, ESCAPE_KEY, NUMBER_ANNOTATION, REFERENCE_ANNOTATION, UNDEFINED_ANNOTATION, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AnnotatedJsonObject, type Annotation, type Annotations, type CompositeAnnotation, type EntityId, type EscapedProperty, type JsonArray, type JsonMap, type JsonObject, type JsonValue, type TypeId } from './json.js';
import { deserializeNumber, validateObjectKey, type ObjectLike, type Primitive } from './transformers.js';
import type { UberJson } from './uberJson.js';

export abstract class Deserializer {
    readonly uberJson: UberJson;

    constructor(uberJson: UberJson) {
        this.uberJson = uberJson;
    }

    deserialize(value: AnnotatedJsonObject): unknown {
        const isWrapped = value[ESCAPE_KEY]?.[ESCAPE_KEY] === WRAPPED_DIRECTIVE;

        const deserialized = this.deserializePlainObject(value);

        return isWrapped ? deserialized[WRAPPED_KEY] : deserialized;
    }

    // #region Context

    protected annotation: Annotation | CompositeAnnotation | undefined;
    protected compositeIndex: number | undefined;

    // #endregion
    // #region Annotations

    private getAnnotatedType(): TypeId | undefined {
        const annotationOrComposite = this.annotation;
        if (annotationOrComposite === undefined)
            return undefined;

        if (this.compositeIndex === undefined)
            return this.parseAnnotation(annotationOrComposite as Annotation);

        const nestedAnnotation = (annotationOrComposite as CompositeAnnotation)[this.compositeIndex];
        return nestedAnnotation === undefined
            ? undefined
            : this.parseAnnotation(nestedAnnotation);
    }

    protected abstract parseAnnotation(annotation: Annotation): TypeId | undefined;

    // #endregion
    // #region References

    protected abstract trySetReference(value: ObjectLike): void;

    protected abstract cleanupReference(): void;

    protected abstract getReference(entityId: EntityId): ObjectLike;

    // #endregion
    // #region Objects

    deserializePlainObject(value: JsonObject): Record<string, unknown> {
        const output = {} as Record<string, unknown>;
        this.trySetReference(output);
        const annotations = value[ESCAPE_KEY] as Annotations | undefined;

        const prevAnnotation = this.annotation;
        const prevCompositeIndex = this.compositeIndex;

        // Context switch

        for (const [ key, item ] of Object.entries(value)) {
            validateObjectKey(key);

            if (key === ESCAPE_KEY)
                continue;

            this.annotation = annotations?.[key];
            this.compositeIndex = undefined;

            output[key] = this.deserializeValue(item);
        }

        const escapedProperty = annotations?.[ESCAPE_KEY] as EscapedProperty | undefined;
        if (escapedProperty !== undefined) {
            this.annotation = escapedProperty.annotation;
            this.compositeIndex = undefined;

            output[ESCAPE_KEY] = this.deserializeValue(escapedProperty.value);
        }

        // Context switch

        this.annotation = prevAnnotation;
        this.compositeIndex = prevCompositeIndex;

        this.cleanupReference();

        return output;
    }

    // #endregion
    // #region Arrays

    deserializeArray(value: JsonArray): unknown[] {
        const output = Array(value.length);
        this.trySetReference(output);

        for (let i = 0; i < value.length; i++)
            output[i] = this.deserializeArrayElement(value[i]);

        this.cleanupReference();

        return output;
    }

    deserializeSet(value: JsonArray): Set<unknown> {
        const output = new Set();
        this.trySetReference(output);

        for (const item of value)
            output.add(this.deserializeArrayElement(item));

        this.cleanupReference();

        return output;
    }

    deserializeMap(value: JsonMap): Map<unknown, unknown> {
        const output = new Map();
        this.trySetReference(output);

        for (const [ key, item ] of value) {
            // Map is also an array so the composite index must be defined here.
            this.compositeIndex!++;

            output.set(
                this.deserializeArrayElement(key),
                this.deserializeArrayElement(item),
            );
        }

        this.cleanupReference();

        return output;
    }

    private deserializeArrayElement(value: JsonValue): ObjectLike | Primitive {
        // In arrays, composite index must be defined.
        this.compositeIndex!++;
        return this.deserializeValue(value);
    }

    // #endregion
    // #region Transformers

    private deserializeValue(value: JsonValue): ObjectLike | Primitive {
        const isArray = Array.isArray(value);
        if (isArray && this.compositeIndex === undefined)
            this.compositeIndex = 0;

        const annotation = this.getAnnotatedType();

        if (annotation !== undefined)
            return this.deserializeTypedValue(value, annotation);

        if (typeof value !== 'object' || value === null)
            return value;
        if (Array.isArray(value))
            return this.deserializeArray(value);

        return this.deserializePlainObject(value);
    }

    private deserializeTypedValue(value: JsonValue, typeId: TypeId): ObjectLike | Primitive {
        switch (typeId) {
            case REFERENCE_ANNOTATION:
                return this.getReference(value as EntityId);
            case UNDEFINED_ANNOTATION:
                return undefined;
            case NUMBER_ANNOTATION:
                return deserializeNumber(value as string);
            case BIGINT_ANNOTATION:
                return BigInt(value as string);
            default: {
                const transformer = this.uberJson.getTransformerForType(typeId);
                return transformer.deserialize(value, this);
            }
        }
    }

    // #endregion
}
