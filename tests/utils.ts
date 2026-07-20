import { expect } from 'bun:test';
import { UberJson } from '../src/uberJson.js';
import type { JsonObject, JsonValue } from '../src/json.js';
import { stringifyPath } from '../src/path.js';

export function wrap(value: JsonValue, annotations?: Record<string, unknown>): JsonObject {
    return {
        $: { $: 'wrapped', ...annotations },
        w: value,
    };
}

export function testSerializeDeserialize(input: unknown, expectedSerialized: JsonObject) {
    // Make sure the input is not mutated during serialization.
    deepFreeze(input);

    const serialized = UberJson.serialize(input);
    expect(serialized).toEqual(expectedSerialized);

    const stringified = JSON.stringify(serialized);
    const parsed = JSON.parse(stringified);

    // Again, no changes during deserialization.
    deepFreeze(parsed);

    const deserialized = UberJson.deserialize(parsed);
    expect(deserialized).toEqual(input);

    testReferences(input, deserialized);
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- This is needed for instanceof checks. Nothing else really works.
export const nonReferenceTypes: Function[] = [
    Date,
    RegExp,
    URL,
    ...typedArrayConstructors,
];

/** This function isn't exactly efficient. But that's fine for testing purposes. */
export function testReferences(a: unknown, b: unknown, nonReferences = nonReferenceTypes) {
    // This function deeply checks all objects from a and b.
    // Unless the object is a non-reference type, internal aliasing must match.
    const aPaths = normalizeReferencePaths(a, nonReferences);
    const bPaths = normalizeReferencePaths(b, nonReferences);
    expect(aPaths).toEqual(bPaths);
}

function normalizeReferencePaths(value: unknown, nonReferences: typeof nonReferenceTypes) {
    const references = findAllReferencePaths(value, new Map(), nonReferences);
    return references
        .map(paths => [ ...paths ].sort(compareStrings))
        .sort(comparePathGroups);
}

function comparePathGroups(left: string[], right: string[]) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index++) {
        const comparison = compareStrings(left[index]!, right[index]!);
        if (comparison !== 0)
            return comparison;
    }

    return left.length - right.length;
}

function compareStrings(left: string, right: string) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}

function findAllReferencePaths(
    value: unknown,
    output: Map<unknown, string[]>,
    nonReferences: typeof nonReferenceTypes,
): string[][] {
    visitReferencePaths(value, [], output, nonReferences, new Set());

    // We have to check only objects with multiple references.
    return [ ...output.values() ].filter(paths => paths.length > 1);
}

function visitReferencePaths(
    currentValue: unknown,
    path: string[],
    output: Map<unknown, string[]>,
    nonReferences: typeof nonReferenceTypes,
    objectsInPath: Set<object>,
): void {
    if (typeof currentValue !== 'object' || currentValue === null)
        return;

    if (shouldTrackReference(currentValue, nonReferences)) {
        const currentPath = stringifyPath(path);
        const existingPaths = output.get(currentValue);
        if (existingPaths) {
            existingPaths.push(currentPath);
            return;
        }

        output.set(currentValue, [ currentPath ]);
    }

    if (objectsInPath.has(currentValue))
        return;

    objectsInPath.add(currentValue);

    if (Array.isArray(currentValue)) {
        for (const [ key, child ] of Object.entries(currentValue))
            visitReferencePaths(child, [ ...path, key ], output, nonReferences, objectsInPath);
    }
    else  if (currentValue instanceof Set) {
        let index = 0;
        for (const child of currentValue) {
            visitReferencePaths(child, [ ...path, `${index}` ], output, nonReferences, objectsInPath);
            index += 1;
        }
    }
    else if (currentValue instanceof Map) {
        let index = 0;
        for (const [ key, child ] of currentValue) {
            visitReferencePaths(key, [ ...path, `${index}`, 'key' ], output, nonReferences, objectsInPath);
            visitReferencePaths(child, [ ...path, `${index}`, 'value' ], output, nonReferences, objectsInPath);
            index += 1;
        }
    }
    else {
        for (const [ key, child ] of Object.entries(currentValue))
            visitReferencePaths(child, [ ...path, key ], output, nonReferences, objectsInPath);
    }

    objectsInPath.delete(currentValue);
}

function shouldTrackReference(currentValue: unknown, nonReferences: typeof nonReferenceTypes): currentValue is object {
    return !nonReferences.some(constructor => currentValue instanceof constructor);
}
