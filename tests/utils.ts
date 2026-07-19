import { expect } from 'bun:test';
import { uberJson } from '../src/uberJson.js';
import type { JsonObject, JsonValue } from '../src/json.js';

export function stringifyParse(value: unknown): unknown {
    const stringified = uberJson.stringify(value);
    return uberJson.parse(stringified);
}

/** Checks whether all referential equalities (and non-equalities) from `a` are preserved in `b`. */
export function compareReferentialEqualities(a: unknown, b: unknown): boolean {

}


function findAllReferencePaths(value: unknown, output: Map<unknown, string[]>): string[][] {

}

export function wrap(value: JsonValue, annotations?: Record<string, unknown>): JsonObject {
    return {
        $: { $: 'wrapped', ...annotations },
        w: value,
    };
}

export function testSerializeDeserialize(input: unknown, expectedSerialized: JsonObject) {
    // Make sure the input is not mutated during serialization.
    deepFreeze(input);

    const serialized = uberJson.serialize(input);
    expect(serialized).toEqual(expectedSerialized);

    // Again, no changes during deserialization.
    deepFreeze(serialized);

    const deserialized = uberJson.deserialize(serialized);
    expect(deserialized).toEqual(input);
}

function deepFreeze(object: unknown, visitedObjects = new Set()) {
    if (typeof object !== 'object' || object === null)
        return;

    // Can't be frozen.
    if (typedArrayConstructors.some(constructor => object instanceof constructor))
        return;

    if (visitedObjects.has(object))
        return;

    visitedObjects.add(object);

    if (Array.isArray(object)) {
        object.forEach(o => deepFreeze(o, visitedObjects));
    }
    else if (object instanceof Set) {
        object.forEach(o => deepFreeze(o, visitedObjects));
    }
    else if (object instanceof Map) {
        object.forEach((value, key) => {
            deepFreeze(key, visitedObjects);
            deepFreeze(value, visitedObjects);
        });
    }
    else {
        Object.values(object).forEach(o => deepFreeze(o, visitedObjects));
    }

    Object.freeze(object);
}

const typedArrayConstructors = [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float16Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
];
