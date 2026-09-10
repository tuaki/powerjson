import type { SortObjectKeysOption } from './deduplicatedDeserializer.ts';
import type { AlgorithmVersion, TypeId } from './json.ts';
import { baseTransformers, typedArrayTransformers, type ObjectLike, type Transformer } from './transformers.ts';

export type PowerJsonOptions = {
    space?: string | number;
    deduplicate?: boolean;
    sortObjectKeys?: SortObjectKeysOption;
    transformers?: Transformer[];
    /**
     * For each symbol, provide either symbol-ID pair, or just the symbol.
     * In the latter case, the symbol's description will be used as the ID. If the description is undefined, an error will be thrown.
     */
    symbols?: (symbol | [symbol, string])[];
};

export class PowerJsonConfig {
    readonly space: string | number | undefined;
    readonly deduplicate: boolean;
    readonly sortObjectKeys: SortObjectKeysOption;

    constructor({
        space = undefined,
        deduplicate = false,
        sortObjectKeys = 'catch',
        transformers = [],
        symbols = [],
    }: PowerJsonOptions = {}) {
        this.space = space;
        this.deduplicate = deduplicate;
        this.sortObjectKeys = sortObjectKeys;

        [
            ...Object.values(baseTransformers),
            ...typedArrayTransformers,
            ...transformers,
        ].forEach(transformer => this.registerTransformer(transformer));

        symbols.forEach(symbol => this.registerSymbol(symbol));
    }

    get version(): AlgorithmVersion {
        return this.deduplicate ? 2 : 1;
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

    getObjectTransformer(value: ObjectLike): Transformer {
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

    getTransformerByType(typeId: TypeId): Transformer {
        const transformer = this.transformersByType.get(typeId);
        if (!transformer)
            throw new Error(`No transformer found for type: ${typeId}.`);

        return transformer;
    }

    private readonly symbolIdsBySymbol: Map<symbol, string> = new Map();
    private readonly symbolsById: Map<string, symbol> = new Map();

    // We could use the global symbol registry (Symbol.for and Symbol.keyFor) but it's not guaranteed the users actually want to register their symbols there.
    // Also, we want a better control (e.g., explicit errors).

    private registerSymbol(symbolOrPair: symbol | [symbol, string]): void {
        const [ symbol, id ] = Array.isArray(symbolOrPair)
            ? symbolOrPair
            : [ symbolOrPair, symbolOrPair.description ];

        if (id === undefined) {
            // No need to print the symbol - it will be "Symbol()" anyway.
            throw new Error('Trying to register a symbol without an explicit ID or description.');
        }

        this.symbolIdsBySymbol.set(symbol, id);
        this.symbolsById.set(id, symbol);
    }

    getSymbolId(symbol: symbol): string | undefined {
        return this.symbolIdsBySymbol.get(symbol);
    }

    getSymbolById(id: string): symbol {
        const symbol = this.symbolsById.get(id);
        if (symbol === undefined)
            throw new Error(`No symbol found for id: ${id}.`);

        return symbol;
    }
}
