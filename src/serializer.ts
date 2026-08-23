import { BIGINT_ANNOTATION, ESCAPE_KEY, NUMBER_ANNOTATION, REFERENCE_ANNOTATION, UNDEFINED_ANNOTATION, WRAPPED_DIRECTIVE, WRAPPED_KEY, type AnnotatedJsonObject, type Annotation, type Annotations, type EscapedProperty, type JsonArray, type JsonMap, type JsonValue } from './json.js';
import { stringifyPath, type Path, type StringifiedPath } from './path.js';
import { serializeNumber, validateObjectKey, type ISerializer, type ObjectLike } from './transformers.js';
import type { UberJson } from './uberJson.js';
import { ensureProperty } from './utils.js';

export class Serializer implements ISerializer {
    constructor(
        readonly uberJson: UberJson,
    ) {}

    serialize(value: unknown): AnnotatedJsonObject {
        // If the top-level value isn't a plain object, we have to wrap it so that it can put its annotations somewhere.
        const isWrapped = !isPlainObject(value);

        const input = isWrapped ? { [WRAPPED_KEY]: value } : value;
        this.tryCreateReference(input);
        const serialized = this.serializePlainObject(input);

        if(isWrapped) {
            const annotations = ensureProperty(serialized, ESCAPE_KEY, {});
            annotations[ESCAPE_KEY] = WRAPPED_DIRECTIVE;
        }

        return serialized;
    }

    private readonly rootToParent: Path = [];
    private parentToValue: Path = [];

    private readonly allReferences = new Map<ObjectLike, StringifiedPath>();
    private readonly pathReferences = new Set<ObjectLike>();

    /**
     * Needs to be explicitly set so don't forget about it!
     * This is done by calling {@link serializePlainObject} first.
     */
    private annotations!: Annotations;

    static readonly ESCAPE_KEY = '$';

    private addAnnotation(annotation: Annotation): void {
        // TODO not ideal
        const key = stringifyPath(this.parentToValue);

        if (key === ESCAPE_KEY)
            this.getEscapedProperty().annotation = annotation;
        else
            this.annotations[key] = annotation;
    }

    private getEscapedProperty(): EscapedProperty {
        return ensureProperty(this.annotations, ESCAPE_KEY, {}) as EscapedProperty;
    }

    static readonly REFERENCE_ANNOTATION = 'ref';

    private tryCreateReference(value: ObjectLike): string | undefined {
        if (this.allReferences.has(value)) {
            // We have already seen this object. It might be a circular reference. If it is, we have to deduplicate it.
            const deduplicate = this.uberJson.deduplicate || this.pathReferences.has(value);
            if (deduplicate) {
                const reference = this.allReferences.get(value)!;
                this.addAnnotation(REFERENCE_ANNOTATION);
                return reference;
            }
        }
        else {
            // Never seen this one before.
            this.allReferences.set(value, stringifyPath([ ...this.rootToParent, ...this.parentToValue ]));
        }

        this.pathReferences.add(value);

        return undefined;
    }

    private serializeChild(value: unknown, key: string): JsonValue | undefined {
        this.parentToValue.push(key);
        const output = this.serializeUnknown(value);
        this.parentToValue.pop();

        return output;
    }

    serializePlainObject(value: Record<string, unknown>): AnnotatedJsonObject {
        // Explicitly creating the annotations also forces the escape key to be in the first position of each object. This is just a visual thing, but it makes it easier to read the output.
        // If not needed, the annotations will be deleted later.
        const output: AnnotatedJsonObject = { [ESCAPE_KEY]: {} };

        const prevAnnotations = this.annotations;
        this.annotations = output[ESCAPE_KEY]!;

        const prevPathFromParent = this.parentToValue;
        this.rootToParent.push(...prevPathFromParent);
        this.parentToValue = [];

        // End context

        for (const [ key, item ] of Object.entries(value)) {
            validateObjectKey(key);

            const serializedItem = this.serializeChild(item, key);
            if (serializedItem === undefined) {
                // `undefined` is an escape hatch for skip. Also, `JSON.stringify({ a: undefined })` returns `{}`.
                continue;
            }

            if (key === ESCAPE_KEY) {
                const escapedProperty = this.getEscapedProperty();
                escapedProperty.value = serializedItem;
            }
            else {
                output[key] = serializedItem;
            }
        }

        // Start context

        this.annotations = prevAnnotations;
        if (Object.keys(output[ESCAPE_KEY]!).length === 0)
            delete output[ESCAPE_KEY];

        this.parentToValue = prevPathFromParent;
        this.rootToParent.splice(this.rootToParent.length - this.parentToValue.length, this.parentToValue.length);

        return output;
    }

    serializeArray(value: unknown[]): JsonArray {
        const output: JsonArray = Array(value.length);
        for (let i = 0; i < value.length; i++)
            // Arrays have to preserve indexes. So, we decided to keep `undefined` as `null`. Also, `JSON.stringify([ undefined ])` returns `[ null ]`.
            output[i] = this.serializeChild(value[i], String(i)) ?? null;

        return output;
    }

    serializeSet(value: Set<unknown>): JsonArray {
        const output: JsonArray = Array(value.size);
        let i = 0;
        for (const item of value) {
            const serializedItem = this.serializeChild(item, String(i));
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
            this.parentToValue.push(String(i));

            const serializedKey = this.serializeChild(key, '0');
            const serializedItem = this.serializeChild(item, '1');

            if (serializedKey !== undefined && serializedItem !== undefined) {
                // Maps are not indexed, so `undefined` means skip.
                output[i] = [ serializedKey, serializedItem ];
                i++;
            }

            this.parentToValue.pop();
        }

        return output;
    }

    // #endregion

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
                // Ideally, let's make it optional (this would require explicit versioning).
                this.addAnnotation(BIGINT_ANNOTATION);
                return String(value);
            case 'object':
                return value === null ? null : this.serializeObjectLike(value);
            case 'symbol':
                // TODO Symbols are not supported yet.
                return undefined;
            case 'function':
                // This ain't gonna happen.
                return undefined;
        }
    }

    private serializeObjectLike(value: ObjectLike): JsonValue | undefined {
        const transformer = this.uberJson.getTransformerForObject(value);

        if (transformer.isReferenceType) {
            const reference = this.tryCreateReference(value);
            if (reference !== undefined)
                return reference;
        }

        if (transformer.annotation !== undefined)
            this.addAnnotation(transformer.annotation);

        const output = transformer.serialize(value, this);

        if (transformer.isReferenceType)
            this.pathReferences.delete(value);

        return output;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null)
        return false;

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
