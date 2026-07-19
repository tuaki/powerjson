import type { AnnotatedJsonObject, Annotation, EscapedProperty, JsonArray, JsonMap, JsonObject, JsonValue } from './json.js';
import { stringifyPath, type Path, type StringifiedPath } from './path.js';
import type { ObjectLike } from './transformers.js';
import type { UberJson } from './uberJson.js';
import { ensureProperty } from './utils.js';

export class Serializer {
    constructor(
        readonly uberJson: UberJson,
    ) {}

    static readonly WRAPPED_KEY = 'w';
    static readonly WRAPPED_DIRECTIVE = 'wrapped';

    serialize(value: unknown): JsonObject {
        // If the top-level value isn't a plain object, we have to wrap it so that it can put its annotations somewhere.
        const isWrapped = !this.isPlainObject(value);

        const input = isWrapped ? { [Serializer.WRAPPED_KEY]: value } : value;
        this.tryCreateReference(input);
        const serialized = this.serializePlainObject(input);

        if(isWrapped) {
            const annotations = ensureProperty(serialized, Serializer.ESCAPE_KEY, {});
            annotations[Serializer.ESCAPE_KEY] = Serializer.WRAPPED_DIRECTIVE;
        }

        return serialized;
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        if (typeof value !== 'object' || value === null)
            return false;

        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    private readonly rootToParent: Path = [];
    private parentToValue: Path = [];

    private readonly allReferences = new Map<ObjectLike, StringifiedPath>();
    private readonly pathReferences = new Set<ObjectLike>();

    /**
     * The object to which we write the annotations. Should be the last object in the path.
     * Needs to be explicitly set so don't forget about it!
     * This is done by calling {@link serializePlainObject} first.
     */
    private parentObject!: AnnotatedJsonObject<typeof Serializer.ESCAPE_KEY>;

    static readonly ESCAPE_KEY = '$';

    addAnnotation(annotation: Annotation): void {
        const annotations = ensureProperty(this.parentObject, Serializer.ESCAPE_KEY, {});

        // TODO not ideal
        const key = stringifyPath(this.parentToValue);

        if (key === Serializer.ESCAPE_KEY) {
            const escapedProperty = ensureProperty(annotations, Serializer.ESCAPE_KEY, {}) as EscapedProperty;
            escapedProperty.annotation = annotation;
        }
        else {
            annotations[key] = annotation;
        }
    }

    private getEscapedProperty(): EscapedProperty {
        const annotations = ensureProperty(this.parentObject, Serializer.ESCAPE_KEY, {});
        return ensureProperty(annotations, Serializer.ESCAPE_KEY, {}) as EscapedProperty;
    }

    static readonly REFERENCE_ANNOTATION = 'ref';

    private tryCreateReference(value: ObjectLike): boolean {
        if (this.allReferences.has(value)) {
            // If this is a cyclic reference, we have to deduplicate it.
            const deduplicate = this.uberJson.deduplicate || this.pathReferences.has(value);
            if (deduplicate) {
                const reference = this.allReferences.get(value)!;
                this.addAnnotation([ Serializer.REFERENCE_ANNOTATION, reference ]);
                return true;
            }

            return false;
        }

        this.allReferences.set(value, stringifyPath([ ...this.rootToParent, ...this.parentToValue ]));
        this.pathReferences.add(value);

        return false;
    }

    private nextContext(): ContextOutput<typeof Serializer.ESCAPE_KEY> {
        const currentObject = {};

        const prevParentObject = this.parentObject;
        this.parentObject = currentObject;

        const prevPathFromParent = this.parentToValue;
        this.rootToParent.push(...prevPathFromParent);
        this.parentToValue = [];

        return {
            currentObject,
            prevParentObject,
            prevPathFromParent,
        };
    }

    private prevContext(context: ContextOutput<typeof Serializer.ESCAPE_KEY>): void {
        this.parentObject = context.prevParentObject;

        this.parentToValue = context.prevPathFromParent;
        this.rootToParent.splice(this.rootToParent.length - this.parentToValue.length, this.parentToValue.length);
    }

    private serializeChild(value: unknown, key: string): JsonValue | undefined {
        this.parentToValue.push(key);
        const output = this.serializeUnknown(value);
        this.parentToValue.pop();

        return output;
    }

    serializePlainObject(value: Record<string, unknown>): AnnotatedJsonObject<typeof Serializer.ESCAPE_KEY> {
        const context = this.nextContext();
        const output = context.currentObject;

        for (const [ key, item ] of Object.entries(value)) {
            if (BLACKLISTED_OBJECT_KEYS.has(key)) {
                // TODO is this necessary?
                throw new Error(`Detected property ${key}. This is a prototype pollution risk, please remove it from your object.`);
            }

            const serializedItem = this.serializeChild(item, key);
            if (serializedItem === undefined) {
                // `undefined` is an escape hatch for skip. Also, `JSON.stringify({ a: undefined })` returns `{}`.
                continue;
            }

            if (key === Serializer.ESCAPE_KEY) {
                const escapedProperty = this.getEscapedProperty();
                escapedProperty.value = serializedItem;
            }
            else {
                output[key] = serializedItem;
            }
        }

        this.prevContext(context);

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

    static readonly UNDEFINED_ANNOTATION = 'undefined';
    static readonly BIGINT_ANNOTATION = 'bigint';

    private serializeUnknown(value: unknown): JsonValue | undefined {
        switch (typeof value) {
            case 'string':
            case 'boolean':
                return value;
            case 'undefined':
                this.addAnnotation(Serializer.UNDEFINED_ANNOTATION);
                return null;
            case 'number':
                return this.serializeNumber(value);
            case 'bigint':
                // NICE_TO_HAVE There is a new approach in ES2026 which already works mostly everywhere, but we should probably just convert it to a string for now.
                // Ideally, let's make it optional (this would require explicit versioning).
                this.addAnnotation(Serializer.BIGINT_ANNOTATION);
                return String(value);
            case 'object':
                if (value === null)
                    return null;

                return this.serializeObjectLike(value);
            case 'symbol':
                // TODO Symbols are not supported yet.
                return undefined;
            case 'function':
                // This ain't gonna happen.
                return undefined;
        }
    }

    static readonly NUMBER_ANNOTATION = 'number';
    static readonly PLUS_INFINITY = 'Infinity';
    static readonly MINUS_INFINITY = '-Infinity';
    static readonly NAN = 'NaN';
    static readonly NEGATIVE_ZERO = '-0';

    private serializeNumber(value: number): number | string {
        switch (value) {
            case Infinity:
                this.addAnnotation(Serializer.NUMBER_ANNOTATION);
                return Serializer.PLUS_INFINITY;
            case -Infinity:
                this.addAnnotation(Serializer.NUMBER_ANNOTATION);
                return Serializer.MINUS_INFINITY;
            case 0:
                if (1 / value === -Infinity) {
                    // NICE_TO_HAVE This can be solved with rawJSON.
                    this.addAnnotation(Serializer.NUMBER_ANNOTATION);
                    return Serializer.NEGATIVE_ZERO;
                }

                return 0;
            default:
                if (Number.isNaN(value)) {
                    this.addAnnotation(Serializer.NUMBER_ANNOTATION);
                    return Serializer.NAN;
                }

                return value;
        }
    }

    private serializeObjectLike(value: ObjectLike): JsonValue | undefined {
        const transformer = this.uberJson.getTransformerForObject(value);

        if (transformer.isReferenceType) {
            if (this.tryCreateReference(value))
                return null;
        }

        if (transformer.annotation !== undefined)
            this.addAnnotation(transformer.annotation);

        const output = transformer.serialize(value, this);

        if (transformer.isReferenceType)
            this.pathReferences.delete(value);

        return output;
    }
}

type ContextOutput<TEscape extends string> = {
    currentObject: AnnotatedJsonObject<TEscape>;
    prevParentObject: AnnotatedJsonObject<TEscape>;
    prevPathFromParent: Path;
};

const BLACKLISTED_OBJECT_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
]);
