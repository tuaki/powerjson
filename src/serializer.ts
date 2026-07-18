import type { AnnotatedJsonObject, Annotation, ControlObject, JsonArray, JsonValue } from './json.js';
import { stringifyPath, type Path, type StringifiedPath } from './path.js';
import { ensureProperty } from './utils.js';

// TODO Use enum with "none", "all", "circular".
// "none" might be a good optímization for non-circular data.
const DEDUPLICATE_REFERENCES = true;

export class Serializer {
    constructor() {
        this.populateTransformers();
    }

    static readonly WRAPPED_KEY = 'value';

    serialize(value: unknown): JsonValue {
        const wrapper = { [Serializer.WRAPPED_KEY]: value };
        const serialized = this.serializePlainObject(wrapper);

        const annotations = serialized[Serializer.ESCAPE_KEY];
        if (annotations === undefined) {
            // If there are no annotations, we can just return the value directly.
            return serialized[Serializer.WRAPPED_KEY];
        }

        // There are annotations, so we have to keep it. Let's mark it as wrapped.
        const controlObject = ensureProperty(annotations, Serializer.ESCAPE_KEY, {});
        controlObject.isWrapped = true;

        return serialized;
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

    private addAnnotation(annotation: Annotation): void {
        const annotations = ensureProperty(this.parentObject, Serializer.ESCAPE_KEY, {});

        // TODO not ideal
        const key = stringifyPath(this.parentToValue);

        if (key === Serializer.ESCAPE_KEY) {
            const control = ensureProperty(annotations, Serializer.ESCAPE_KEY, {});
            control.annotation = annotation;
        }
        else {
            annotations[key] = annotation;
        }
    }

    private getControlObject(): ControlObject {
        const annotations = ensureProperty(this.parentObject, Serializer.ESCAPE_KEY, {});
        return ensureProperty(annotations, Serializer.ESCAPE_KEY, {});
    }

    static readonly REFERENCE_ANNOTATION = 'ref';

    private tryCreateReference(value: ObjectLike): boolean {
        if (this.allReferences.has(value)) {
            // If this is a cyclic reference, we have to deduplicate it.
            const deduplicate = DEDUPLICATE_REFERENCES || this.pathReferences.has(value);
            if (deduplicate) {
                const reference = this.allReferences.get(value)!;
                this.addAnnotation([ Serializer.REFERENCE_ANNOTATION, reference ]);
                return true;
            }
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

    // #region Containers

    private serializePlainObject(value: Record<string, unknown>): AnnotatedJsonObject<typeof Serializer.ESCAPE_KEY> {
        const context = this.nextContext();
        const output = context.currentObject;

        for (const [ key, item ] of Object.entries(value)) {
            // TODO if key === Serializer.ANNOTATIONS_KEY
            if (BLACKLISTED_OBJECT_KEYS.has(key)) {
                // TODO is this necessary?
                throw new Error(`Detected property ${key}. This is a prototype pollution risk, please remove it from your object.`);
            }

            const serializedItem = this.serializeChild(item, key);
            if (serializedItem === undefined) {
                // `undefined` is an escape hatch for skip. Also, `JSON.stringify({ a: undefined })` returns `{}`.
                continue;
            }

            // TODO Test this.
            if (key === Serializer.ESCAPE_KEY) {
                const control = this.getControlObject();
                control.value = serializedItem;
            }
            else {
                output[key] = serializedItem;
            }
        }

        this.prevContext(context);

        return output;
    }

    private serializeArray(value: unknown[]): JsonArray {
        const output: JsonArray = Array(value.length);
        for (let i = 0; i < value.length; i++)
            // Arrays have to preserve indexes. So, we decided to keep `undefined` as `null`. Also, `JSON.stringify([ undefined ])` returns `[ null ]`.
            output[i] = this.serializeChild(value[i], String(i)) ?? null;

        return output;
    }

    static readonly SET_ANNOTATION = 'Set';

    private serializeSet(value: Set<unknown>): JsonArray {
        this.addAnnotation(Serializer.SET_ANNOTATION);

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

    static readonly MAP_ANNOTATION = 'Map';

    private serializeMap(value: Map<unknown, unknown>): JsonArray {
        this.addAnnotation(Serializer.MAP_ANNOTATION);

        const output: [JsonValue, JsonValue][] = Array(value.size);
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
                // TODO There is a new approach in ES2026 which already works mostly everywhere, but we should probably just convert it to a string for now.
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
                    // TODO This can be solved with rawJSON.
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
        const transformer = this.findTransformer(value);

        if (transformer.isReferenceType) {
            if (this.tryCreateReference(value))
                return null;
        }

        const output = transformer.serialize(value);

        if (transformer.isReferenceType)
            this.pathReferences.delete(value);

        return output;
    }

    // There are several ways how to dispatch objects by type. We can use `instanceof`, `value.constructor`, or `Object.getPrototypeOf(value)`.
    // All of them can be subverted - `constructor` can be changed, `instanceof` can be overridden with `Symbol.hasInstance`, and `Object.getPrototypeOf` can be overridden with `Object.setPrototypeOf`.
    // Whoever does that surely deserves to be punished. So, let's just not care about it.
    //
    // By semantics, `instanceof` is probably the most correct way to do this. However, trying one type after another seems inefficient.
    // By default, `instanceof` just checks the prototype chain [1], so we can do it ourselves. Then we can immediately find the transformer in a map.
    // This is not exactly the same (because of `Symbol.hasInstance`), but as said above, we don't support it.
    //
    // There are other traps like the fact that different realms (e.g., iframes, web workers) have different prototypes. In that case, neither of these methods will work.
    // Workaronds are available but only for some types (e.g., `Array.isArray`) and not the others (e.g., `Set`, `Date`). Libraries like node:util/types [2] provides them but they are not available in the browser.
    //
    // [1] https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof
    // [2] https://bun.com/reference/node/util/types

    readonly transfomers: Map<ObjectLike, Transformer> = new Map();

    private findTransformer(value: ObjectLike): Transformer {
        let prototype = Object.getPrototypeOf(value);

        while (prototype !== null) {
            const transformer = this.transfomers.get(prototype);
            if (transformer)
                return transformer;

            prototype = Object.getPrototypeOf(prototype);
        }

        // The previous search might fail because of `Object.create(null)` shenanigans.
        // Let's try to support at least the bare minimum of objects and arrays across realms. It ain't much but it's honest work.
        const defaultPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
        return this.transfomers.get(defaultPrototype)!;
    }

    private populateTransformers() {
        this.transfomers.set(Array.prototype, {
            name: 'Array',
            isReferenceType: true,
            serialize: value => this.serializeArray(value as unknown[]),
            deserialize: value => 'TODO',
        });

        this.transfomers.set(Set.prototype, {
            name: 'Set',
            isReferenceType: true,
            serialize: value => this.serializeSet(value as Set<unknown>),
            deserialize: value => 'TODO',
        });

        this.transfomers.set(Map.prototype, {
            name: 'Map',
            isReferenceType: true,
            serialize: value => this.serializeMap(value as Map<unknown, unknown>),
            deserialize: value => 'TODO',
        });

        this.transfomers.set(Object.prototype, {
            name: 'Object',
            isReferenceType: true,
            serialize: value => this.serializePlainObject(value as Record<string, unknown>),
            deserialize: value => 'TODO',
        });

        // Contrary to superjson, we don't think built-in types should not be deduplicated by default. They are usually immutable and don't contain other values.

        this.transfomers.set(Date.prototype, {
            name: 'Date',
            isReferenceType: false,
            serialize: value => this.serializeDate(value as Date),
            deserialize: value => 'TODO',
        });

        this.transfomers.set(RegExp.prototype, {
            name: 'RegExp',
            isReferenceType: false,
            serialize: value => this.serializeRegExp(value as RegExp),
            deserialize: value => 'TODO',
        });

        this.transfomers.set(URL.prototype, {
            name: 'URL',
            isReferenceType: false,
            serialize: (value: URL) => this.serializeURL(value),
            deserialize: value => 'TODO',
        });
    }

    // `String(value)` is different from `value.toString()`.
    // For primitive types, the first one should be, in general, faster. So we use it for stringifying indexes and so on.
    // For objects, the first one can be overriden by `Symbol.toPrimitive` or `valueOf`. The second one can be overriden as well ... however, we decided on the second one because it is more explicit and less likely to be overriden.

    static readonly DATE_ANNOTATION = 'Date';

    private serializeDate(value: Date): string | null {
        this.addAnnotation(Serializer.DATE_ANNOTATION);
        // Date can be invalid; let's serialize it as null.
        return isNaN(+value) ? null : value.toISOString();
    }

    static readonly REGEXP_ANNOTATION = 'RegExp';

    private serializeRegExp(value: RegExp): string {
        this.addAnnotation(Serializer.REGEXP_ANNOTATION);
        // Returns a string in the form of `/pattern/flags`.
        return value.toString();
    }

    static readonly URL_ANNOTATION = 'URL';

    private serializeURL(value: URL): string {
        this.addAnnotation(Serializer.URL_ANNOTATION);
        return value.toString();
    }

    // TODO Temporal
    // TODO Error
    // TODO TypedArray
}

type ContextOutput<TEscape extends string> = {
    currentObject: AnnotatedJsonObject<TEscape>;
    prevParentObject: AnnotatedJsonObject<TEscape>;
    prevPathFromParent: Path;
};

export type Primitive = undefined | null | string | number | boolean | bigint | symbol;

/**
 * In TS, `object` represents any non-primitive type. This means "anything that returns `object` or `function` from `typeof` except `null`".
 * In our case, we don't support functions. So, let's use this types as "`object` without functions".
 */
export type ObjectLike = object;

const BLACKLISTED_OBJECT_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
]);

export type Transformer<TType extends ObjectLike = ObjectLike> = {
    name: string;
    /**
     * Reference types are subject to deduplication and circular reference detection. Value types are not.
     */
    isReferenceType: boolean;
    /**
     * Serializes the value to a JSON value.
     * If undefined is returned, the value will be skipped from objects, sets, and maps. However, it will be kept in arrays as `null` to preserve indexes.
     * Try `JSON.stringify({ a: undefined })` and `JSON.stringify([ undefined ])` to see the difference.
     */
    serialize(value: TType): JsonValue | undefined;
    /**
     * Deserializes the value from a JSON value and an annotation.
     */
    deserialize(value: JsonValue, annotation: Annotation): TType;
};
