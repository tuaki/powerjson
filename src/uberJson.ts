import type { TypeId, JsonObject } from './json.js';
import { baseTransformers, typedArrayTransformers, type ObjectLike, type Transformer } from './transformers.js';
import type { Serializer } from './serializer.js';
import { SimpleSerializer } from './simpleSerializer.js';
import { DeduplicatedSerializer } from './deduplicatedSerializer.js';
import type { Deserializer } from './deserializer.js';
import { SimpleDeserializer } from './simpleDeserializer.js';
import { DeduplicatedDeserializer } from './deduplicatedDeserializer.js';

type AlgorithmConstructor<T> = {
    new (uberJson: UberJson): T;
};

export class UberJson {
    readonly deduplicate: boolean;
    readonly sortObjectKeys: boolean;

    readonly serializerConstructor: AlgorithmConstructor<Serializer>;
    readonly deserializerConstructor: AlgorithmConstructor<Deserializer>;

    constructor({
        deduplicate = false,
        sortObjectKeys = false,
    }: {
        deduplicate?: boolean;
        sortObjectKeys?: boolean;
    } = {}) {
        this.deduplicate = deduplicate;
        this.sortObjectKeys = sortObjectKeys;

        this.serializerConstructor = deduplicate ? DeduplicatedSerializer : SimpleSerializer;
        this.deserializerConstructor = deduplicate ? DeduplicatedDeserializer : SimpleDeserializer;

        this.addTransformers();
    }

    serialize(value: unknown): JsonObject {
        const serializer = new this.serializerConstructor(this);
        return serializer.serialize(value);
    }

    deserialize<T = unknown>(jsonValue: JsonObject): T {
        const deserializer = new this.deserializerConstructor(this);
        return deserializer.deserialize(jsonValue) as T;
    }

    stringify(value: unknown, space?: string | number): string {
        return JSON.stringify(this.serialize(value), undefined, space);
    }

    parse<T = unknown>(string: string): T {
        return this.deserialize(JSON.parse(string)) as T;
    }


    private readonly transformersByPrototype: Map<ObjectLike, Transformer> = new Map();
    private readonly transformersByType: Map<string, Transformer> = new Map();

    /**
     * Registers a transformer for a specific type.
     * Unless override is set to true, it will throw an error if a transformer for the same type or annotation is already registered.
     */
    registerTransformer(transformer: Transformer, options?: { override?: boolean }): void {
        const prototype = transformer.clazz.prototype;

        if (!options?.override) {
            const existingByPrototype = this.transformersByPrototype.get(prototype);
            if (existingByPrototype !== undefined)
                throw new Error(`Transformer for class "${transformer.clazz.name}" is already registered with type "${existingByPrototype.type}".`);

            if (transformer.type !== undefined) {
                const existingByType = this.transformersByType.get(transformer.type);
                if (existingByType !== undefined)
                    throw new Error(`Transformer for type "${transformer.type}" is already registered with class "${existingByType.clazz.name}".`);
            }
        }

        this.transformersByPrototype.set(prototype, transformer);
        if (transformer.type !== undefined)
            this.transformersByType.set(transformer.type, transformer);
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

    getTransformerForObject(value: ObjectLike): Transformer {
        let prototype = Object.getPrototypeOf(value);

        while (prototype !== null) {
            const transformer = this.transformersByPrototype.get(prototype);
            if (transformer)
                return transformer;

            prototype = Object.getPrototypeOf(prototype);
        }

        // The previous search might fail because of `Object.create(null)` shenanigans.
        // Let's try to support at least the bare minimum of objects and arrays across realms. It ain't much but it's honest work.
        const defaultPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
        return this.transformersByPrototype.get(defaultPrototype)!;
    }

    getTransformerForType(typeId: TypeId): Transformer {
        const transformer = this.transformersByType.get(typeId);
        if (!transformer)
            throw new Error(`No transformer found for type: ${typeId}.`);

        return transformer;
    }

    private addTransformers() {
        [
            ...Object.values(baseTransformers),
            ...typedArrayTransformers,
        ].forEach(transformer => this.registerTransformer(transformer));
    }

    private static defaultInstance = new UberJson();

    static serialize = UberJson.defaultInstance.serialize.bind(UberJson.defaultInstance);
    static deserialize = UberJson.defaultInstance.deserialize.bind(UberJson.defaultInstance);
    static stringify = UberJson.defaultInstance.stringify.bind(UberJson.defaultInstance);
    static parse = UberJson.defaultInstance.parse.bind(UberJson.defaultInstance);
    static registerTransformer = UberJson.defaultInstance.registerTransformer.bind(UberJson.defaultInstance);
}
