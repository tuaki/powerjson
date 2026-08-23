import { BIGINT_ANNOTATION, ESCAPE_KEY, NUMBER_ANNOTATION, REFERENCE_ANNOTATION, UNDEFINED_ANNOTATION, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AnnotatedJsonObject, type Annotation, type Annotations, type EscapedProperty, type JsonArray, type JsonMap, type JsonObject, type JsonValue } from './json.js';
import { stringifyPath, type Path, type StringifiedPath } from './path.js';
import { deserializeNumber, validateObjectKey, type IDeserializer, type ObjectLike, type Primitive } from './transformers.js';
import type { UberJson } from './uberJson.js';

export class Deserializer implements IDeserializer {
    constructor(
        readonly uberJson: UberJson,
    ) {}

    deserialize(value: AnnotatedJsonObject): unknown {
        const isWrapped = value[ESCAPE_KEY]?.[ESCAPE_KEY] === WRAPPED_DIRECTIVE;

        const deserialized = this.deserializePlainObject(value);

        return isWrapped ? deserialized[WRAPPED_KEY] : deserialized;
    }

    private readonly rootToParent: Path = [];
    private parentToValue: Path = [];

    // TODO `stringifyPath` is slow. Two fixes:
    // - don't proactively create reference for each object.
    // - iterate over annotations, not over values.
    //    - not possible, we have to explore all objects
    //    - however, we can put something like 'stop' annotation to objects / arrays that should not be explored further (during serialization).

    annotations: Annotations | undefined;

    private getAnnotation(): Annotation | undefined {
        if (!this.annotations)
            return undefined;

        const key = stringifyPath(this.parentToValue);

        if (key === ESCAPE_KEY)
            return this.getEscapedProperty()?.annotation;
        else
            return this.annotations[key];
    }

    private getEscapedProperty(): EscapedProperty | undefined {
        return this.annotations?.[ESCAPE_KEY] as EscapedProperty | undefined;
    }

    private readonly allReferences = new Map<StringifiedPath, ObjectLike>();

    private setReference(value: ObjectLike): void {
        this.allReferences.set(stringifyPath([ ...this.rootToParent, ...this.parentToValue ]), value);
    }

    private deserializeReference(reference: string): ObjectLike {
        // We expect the json to be deserialized in the same order as it was serialized. I.e., when we encounter a reference, it should have already been deserialized and stored in the referenceIdentities map.
        // If this is not true, things will get whole lot more complicated. Basically, set/map objects can have references as keys (or values). We want to preserve the order of the keys (because JS does preserve it), so we need to put the keys there in the same order as they were serialized (they are serialized as arrays, so the order is preserved in JSON).
        // Therefore, we would have to probably first construct all objects to fill the reference map and only after then start filling in the values.

        const referencedValue = this.allReferences.get(reference);
        if (!referencedValue)
            throw new Error(`Reference not found: ${reference}`);

        return referencedValue;
    }

    private deserializeChild(value: JsonValue, key: string): ObjectLike | Primitive {
        this.parentToValue.push(key);
        const output = this.deserializeValue(value);
        this.parentToValue.pop();

        return output;
    }

    // #region Containers

    deserializePlainObject(value: JsonObject): Record<string, unknown> {
        const output = {} as Record<string, unknown>;
        this.setReference(output);

        const prevAnnotations = this.annotations;
        this.annotations = value[ESCAPE_KEY] as Annotations | undefined;

        const prevPathFromParent = this.parentToValue;
        this.rootToParent.push(...prevPathFromParent);
        this.parentToValue = [];

        // End context

        for (const [ key, item ] of Object.entries(value)) {
            validateObjectKey(key);

            if (key === ESCAPE_KEY)
                continue;

            output[key] = this.deserializeChild(item, key);
        }

        const escapedProperty = this.getEscapedProperty();
        if (escapedProperty)
            output[ESCAPE_KEY] = this.deserializeChild(escapedProperty.value!, ESCAPE_KEY);

        // Start context

        this.annotations = prevAnnotations;

        this.parentToValue = prevPathFromParent;
        this.rootToParent.splice(this.rootToParent.length - this.parentToValue.length, this.parentToValue.length);

        return output;
    }

    deserializeArray(value: JsonArray): unknown[] {
        const output = Array(value.length);
        this.setReference(output);

        for (let i = 0; i < value.length; i++)
            output[i] = this.deserializeChild(value[i], String(i));

        return output;
    }

    deserializeSet(value: JsonArray): Set<unknown> {
        const output = new Set();
        this.setReference(output);

        let i = 0;
        for (const item of value) {
            output.add(this.deserializeChild(item, String(i)));
            i++;
        }
        return output;
    }

    deserializeMap(value: JsonMap): Map<unknown, unknown> {
        const output = new Map();
        this.setReference(output);

        let i = 0;
        for (const [ key, item ] of value) {
            this.parentToValue.push(String(i));

            output.set(
                this.deserializeChild(key, '0'),
                this.deserializeChild(item, '1'),
            );

            this.parentToValue.pop();
            i++;
        }

        return output;
    }

    // #endregion

    private deserializeValue(value: JsonValue): ObjectLike | Primitive {
        const annotation = this.getAnnotation();
        if (annotation !== undefined)
            return this.deserializeAnnotatedValue(value, annotation);
        if (typeof value !== 'object' || value === null)
            return value;
        if (Array.isArray(value))
            return this.deserializeArray(value);
        return this.deserializePlainObject(value);
    }

    private deserializeAnnotatedValue(value: JsonValue, annotation: Annotation): ObjectLike | Primitive {
        switch (annotation) {
            case REFERENCE_ANNOTATION:
                return this.deserializeReference(value as string);
            case UNDEFINED_ANNOTATION:
                return undefined;
            case NUMBER_ANNOTATION:
                return deserializeNumber(value as string);
            case BIGINT_ANNOTATION:
                return BigInt(value as string);
            default: {
                const transformer = this.uberJson.getTransformerForAnnotation(annotation);
                const output = transformer.deserialize(value, this);

                if (transformer.isReferenceType)
                    this.setReference(output);

                return output;
            }
        }
    }
}
