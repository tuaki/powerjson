import { expect } from 'bun:test';
import { PowerJson } from '../src/powerJson.ts';
import type { Annotations, JsonObject, JsonValue, RootAnnotations } from '../src/json.js';
import type { Transformer } from '../src/transformers.ts';

export function wrap(value: JsonValue, annotation?: Annotations[string]): JsonObject {
    return {
        $: {
            ...(annotation === undefined ? {} : { w: annotation }),
            wrapped: true,
        },
        w: value,
    };
}

export class Tester {
    private serializers: PowerJson[];
    private reverseJsonOrder: boolean;

    constructor(serializers: PowerJson | PowerJson[], {
        reverseJsonOrder = false,
    }: {
        reverseJsonOrder?: boolean;
    } = {}) {
        this.serializers = Array.isArray(serializers) ? serializers : [ serializers ];
        this.reverseJsonOrder = reverseJsonOrder;
    }

    static createForAll(transformers: Transformer[] = []): Tester {
        return new Tester([
            new PowerJson({ deduplicate: false, transformers }),
            new PowerJson({ deduplicate: true, transformers }),
        ]);
    }

    static addVersionToSerialized(serializer: PowerJson, serialized: JsonObject): JsonObject {
        const version = serializer.deduplicate ? 2 : 1;

        return {
            ...serialized,
            $: {
                ...(serialized.$ as RootAnnotations | undefined ?? {}),
                $: version,
            },
        };
    }

    serialize(input: unknown, callback: (serialized: JsonObject, serializer: PowerJson) => void) {
        for (const serializer of this.serializers) {
            deepFreeze(input);

            const serialized = serializer.serialize(input);
            callback(serialized, serializer);
        }
    }

    serializeDeserialize(input: unknown, ...expectedSerialized: (JsonObject | undefined)[]) {
        let i = 0;
        for (const serializer of this.serializers) {
            let expected = expectedSerialized[i];
            if (expected)
                expected = Tester.addVersionToSerialized(serializer, expected);

            testSerializeDeserialize(serializer, input, expected, this.reverseJsonOrder);
            i = (i + 1) % expectedSerialized.length;
        }
    }

    forEach(callback: (serializer: PowerJson) => void) {
        for (const serializer of this.serializers)
            callback(serializer);
    }
}

export function testSerializeDeserialize(serializer: PowerJson, input: unknown, expectedSerialized?: JsonObject, reverseJsonOrder = false) {
    // Make sure the input is not mutated during serialization.
    deepFreeze(input);

    let serialized = serializer.serialize(input);
    if (expectedSerialized !== undefined)
        expect(serialized).toStrictEqual(expectedSerialized);

    if (reverseJsonOrder)
        serialized = reverseObjectKeys(serialized);

    const parsed = JSON.parse(JSON.stringify(serialized));

    // Again, no changes during deserialization.
    deepFreeze(parsed);

    const deserialized = serializer.deserialize(parsed);
    expect(deserialized).toStrictEqual(input);

    if (serializer.deduplicate)
        testIdentityEqualities(input, deserialized);
    // NICE_TO_HAVE else check the identities but only for circular references ?.
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
const DEFAULT_NON_ENTITIES: Function[] = [
    Date,
    RegExp,
    URL,
    ...typedArrayConstructors,
];

/**
 * Deeply checks that the entities in a and b have the same identity equalities.
 * Entities are all objects except for `nonEntities`.
 * This function isn't exactly efficient. But that's fine for testing purposes.
 */
export function testIdentityEqualities(a: unknown, b: unknown, nonEntities?: typeof DEFAULT_NON_ENTITIES) {
    const finalNonEntities = nonEntities ? [ ...DEFAULT_NON_ENTITIES, ...nonEntities ] : DEFAULT_NON_ENTITIES;

    const objectIsEntity = (value: object) => !finalNonEntities.some(constructor => value instanceof constructor);

    const aPaths = normalizeReferencePaths(a, objectIsEntity);
    const bPaths = normalizeReferencePaths(b, objectIsEntity);
    expect(aPaths).toStrictEqual(bPaths);
}

function normalizeReferencePaths(value: unknown, objectIsEntity: (value: object) => boolean): string[][] {
    const references = findAllEntityPaths(value, new Map(), objectIsEntity);
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

function findAllEntityPaths(
    value: unknown,
    output: Map<unknown, string[]>,
    objectIsEntity: (value: object) => boolean,
): string[][] {
    visitEntityPaths(value, [], output, objectIsEntity, new Set());

    // We have to check only objects with multiple references.
    return [ ...output.values() ].filter(paths => paths.length > 1);
}

function visitEntityPaths(
    value: unknown,
    path: string[],
    output: Map<unknown, string[]>,
    objectIsEntity: (value: object) => boolean,
    objectsInPath: Set<object>,
): void {
    if (typeof value !== 'object' || value === null)
        return;

    if (objectIsEntity(value)) {
        const pathString = stringifyPath(path);
        const existingPaths = output.get(value);
        if (existingPaths) {
            existingPaths.push(pathString);
            return;
        }

        output.set(value, [ pathString ]);
    }

    if (objectsInPath.has(value))
        return;

    objectsInPath.add(value);

    if (Array.isArray(value)) {
        for (const [ key, child ] of Object.entries(value))
            visitEntityPaths(child, [ ...path, key ], output, objectIsEntity, objectsInPath);
    }
    else if (value instanceof Set) {
        let index = 0;
        for (const child of value) {
            visitEntityPaths(child, [ ...path, `${index}` ], output, objectIsEntity, objectsInPath);
            index += 1;
        }
    }
    else if (value instanceof Map) {
        let index = 0;
        for (const [ key, child ] of value) {
            visitEntityPaths(key, [ ...path, `${index}`, 'key' ], output, objectIsEntity, objectsInPath);
            visitEntityPaths(child, [ ...path, `${index}`, 'value' ], output, objectIsEntity, objectsInPath);
            index += 1;
        }
    }
    else {
        for (const [ key, child ] of Object.entries(value))
            visitEntityPaths(child, [ ...path, key ], output, objectIsEntity, objectsInPath);
    }

    objectsInPath.delete(value);
}

export function reverseObjectKeys<T>(value: T): T {
    if (typeof value !== 'object' || value === null)
        return value;

    if (Array.isArray(value))
        return value.map(item => reverseObjectKeys(item)) as T;

    const entries = Object.entries(value as Record<string, unknown>)
        .map(([ key, item ]) => [ key, reverseObjectKeys(item) ] as const)
        .reverse();

    const output: Record<string, unknown> = {};
    for (const [ key, item ] of entries)
        output[key] = item;

    return output as T;
}

function stringifyPath(path: string[]): string {
    return path
        .map(escapeKey)
        .join('.');
}

function escapeKey(key: string) {
    return key.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
