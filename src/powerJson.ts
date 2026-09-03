import { type TypeId, type JsonObject, ESCAPE_CHAR, type RootJsonObject } from './json.ts';
import { baseTransformers, typedArrayTransformers, type ObjectLike, type Transformer } from './transformers.ts';
import { SimpleSerializer } from './simpleSerializer.ts';
import { DeduplicatedSerializer } from './deduplicatedSerializer.ts';
import { SimpleDeserializer } from './simpleDeserializer.ts';
import { DeduplicatedDeserializer, type SortObjectKeysOption } from './deduplicatedDeserializer.ts';

type PowerJsonConfig = {
    deduplicate?: boolean;
    sortObjectKeys?: SortObjectKeysOption;
    transformers?: Transformer[];
};

export class PowerJson {
    readonly deduplicate: boolean;
    readonly sortObjectKeys: SortObjectKeysOption;

    constructor({
        deduplicate = false,
        sortObjectKeys = 'catch',
        transformers = [],
    }: PowerJsonConfig = {}) {
        this.deduplicate = deduplicate;
        this.sortObjectKeys = sortObjectKeys;

        [
            ...Object.values(baseTransformers),
            ...typedArrayTransformers,
            ...transformers,
        ].forEach(transformer => this.registerTransformer(transformer));
    }

    serialize(value: unknown): JsonObject {
        const serializer = this.deduplicate
            ? new DeduplicatedSerializer(this, 2)
            : new SimpleSerializer(this, 1);

        return serializer.serialize(value);
    }

    deserialize<T = unknown>(jsonValue: JsonObject): T {
        const value = jsonValue as RootJsonObject;
        const version = value[ESCAPE_CHAR][ESCAPE_CHAR];

        const deserializer = version === 2
            ? new DeduplicatedDeserializer(this)
            : new SimpleDeserializer(this);

        return deserializer.deserialize(value) as T;
    }

    stringify(value: unknown, space?: string | number): string {
        return JSON.stringify(this.serialize(value), undefined, space);
    }

    parse<T = unknown>(string: string): T {
        return this.deserialize(JSON.parse(string)) as T;
    }


    private readonly transformersByPrototype: Map<ObjectLike, Transformer> = new Map();
    private readonly transformersByType: Map<string, Transformer> = new Map();

    private registerTransformer(transformer: Transformer): void {
        const prototype = transformer.clazz.prototype;
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

    private static defaultInstance = new PowerJson();

    static serialize = PowerJson.defaultInstance.serialize.bind(PowerJson.defaultInstance);
    static deserialize = PowerJson.defaultInstance.deserialize.bind(PowerJson.defaultInstance);
    static stringify = PowerJson.defaultInstance.stringify.bind(PowerJson.defaultInstance);
    static parse = PowerJson.defaultInstance.parse.bind(PowerJson.defaultInstance);
}
