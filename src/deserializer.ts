import { BIGINT_ANNOTATION, ESCAPE_CHAR, NUMBER_ANNOTATION, REFERENCE_ANNOTATION, SYMBOL_ANNOTATION, UNDEFINED_ANNOTATION, unescapeKey, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AlgorithmVersion, type Annotation, type Annotations, type CompositeAnnotation, type EntityId, type JsonArray, type JsonMap, type JsonObject, type JsonValue, type RootJsonObject, type TypeId } from './json.ts';
import { deserializeNumber, validateObjectKey, type ObjectLike, type Primitive } from './transformers.ts';
import type { PowerJsonConfig } from './config.ts';

export function getAlgorithmVersion(value: RootJsonObject): AlgorithmVersion {
    return value[ESCAPE_CHAR][ESCAPE_CHAR];
}

export abstract class Deserializer {
    readonly config: PowerJsonConfig;

    constructor(config: PowerJsonConfig) {
        this.config = config;
    }

    deserialize(value: RootJsonObject): unknown {
        const annotations = value[ESCAPE_CHAR];
        const isWrapped = annotations[WRAPPED_DIRECTIVE] === true && value[WRAPPED_DIRECTIVE] === undefined;

        const deserialized = this.deserializePlainObject(value);

        return isWrapped ? deserialized[WRAPPED_KEY] : deserialized;
    }

    // #region Context

    protected annotation: Annotations[string] | undefined;
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
        const output: Record<string, unknown> = {};
        this.trySetReference(output);

        const annotations = value[ESCAPE_CHAR] as Annotations | undefined;

        const prevAnnotation = this.annotation;
        const prevCompositeIndex = this.compositeIndex;

        // Context switch

        const keys = Object.keys(value);
        const length = keys.length;
        for (let i = 0; i < length; i++) {
            let key = keys[i];
            const item = value[key];

            validateObjectKey(key);

            if (key[0] === ESCAPE_CHAR) {
                if (key === ESCAPE_CHAR)
                    continue;

                this.annotation = annotations?.[key];
                key = unescapeKey(key);
            }
            else {
                this.annotation = annotations?.[key];
            }

            this.compositeIndex = undefined;

            output[key] = this.deserializeValue(item);
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

        const length = value.length;
        for (let i = 0; i < length; i++)
            output[i] = this.deserializeArrayElement(value[i]);

        this.cleanupReference();

        return output;
    }

    deserializeSet(value: JsonArray): Set<unknown> {
        const output = new Set();
        this.trySetReference(output);

        const length = value.length;
        for (let i = 0; i < length; i++)
            output.add(this.deserializeArrayElement(value[i]));

        this.cleanupReference();

        return output;
    }

    deserializeMap(value: JsonMap): Map<unknown, unknown> {
        const output = new Map();
        this.trySetReference(output);

        const length = value.length;
        for (let i = 0; i < length; i++) {
            // Map is also an array so the composite index must be defined here.
            this.compositeIndex!++;

            const entry = value[i];
            output.set(
                this.deserializeArrayElement(entry[0]),
                this.deserializeArrayElement(entry[1]),
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
            case SYMBOL_ANNOTATION:
                return this.config.getSymbolById(value as string);
            default: {
                const transformer = this.config.getTransformerByType(typeId);
                return transformer.deserialize(value, this);
            }
        }
    }

    // #endregion
}
