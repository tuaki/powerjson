import { Deserializer } from './deserializer.ts';
import { ESCAPE_CHAR, REFERENCE_ANNOTATION, type Annotations, type JsonArray, type JsonEntity, type JsonObject, type JsonValue, type EntityId, type Annotation, type CompositeAnnotation, unescapeKey, type RootJsonObject } from './json.ts';
import { validateObjectKey, type ObjectLike } from './transformers.ts';

export type SortKeysOption = 'always' | 'catch' | 'never';

export class DeduplicatedDeserializer extends Deserializer {
    private sortObjectKeys!: SortKeysOption;

    override deserialize(value: RootJsonObject) {
        this.sortObjectKeys = this.uberJson.sortObjectKeys;

        if (this.sortObjectKeys === 'catch') {
            try {
                return super.deserialize(value);
            }
            catch (error) {
                if (error !== expectedReferenceError)
                    throw error;

                // Try again, but this time with sorting enabled.
                this.sortObjectKeys = 'always';
            }
        }

        if (this.sortObjectKeys === 'always')
            value = checkOrSortObjectKeys(value) as RootJsonObject;

        return super.deserialize(value);
    }

    // #region Annotations

    protected override parseAnnotation(annotation: Annotation) {
        switch (typeof annotation) {
            case 'string':
                return annotation;
            case 'number':
                this.entityId = annotation;
                return undefined;
            default:
                this.entityId = annotation[1];
                return annotation[0];
        }
    }

    // #endregion
    // #region References

    private readonly referencedEntities = new Map<EntityId, ObjectLike>();

    // This global pass is really not ideal. However, alternative approach would require polluting all the methods with an additional argument, which is probably not worth it.
    // By default, we set it to 0 which is the root entity id. The root entity doesn't have an explicit id because there is nowhere to store it. But it's always 0 so we don't even need to store it.

    /** If the entity is referenced, this is its id. If not, it is undefined. */
    private entityId: EntityId | undefined = 0;

    protected override trySetReference(value: ObjectLike) {
        const entityId = this.entityId;
        if (entityId !== undefined) {
            this.referencedEntities.set(entityId, value);
            this.entityId = undefined;
        }
    }

    protected override cleanupReference() {
        // Nothing to do here. We don't need to pop the reference because we don't store the path of references. We only store the referenced entities and their ids.
    }

    protected override getReference(entityId: EntityId) {
        const value = this.referencedEntities.get(entityId);
        if (value === undefined) {
            switch (this.sortObjectKeys) {
                case 'catch':
                    // No need to create a dedicated error instance - we will catch it anyway.
                    throw expectedReferenceError;
                case 'always':
                    throw new Error(`Reference not found: ${entityId}.`);
                case 'never':
                    throw new Error(`Reference not found: ${entityId}. Try changing the "sortObjectKeys" option.`);
            }
        }

        return value;
    }

    // #endregion
}

const expectedReferenceError = Symbol('ExpectedReferenceError');

function checkOrSortObjectKeys(value: JsonObject): JsonObject {
    return processObject(value).sortedEntity as JsonObject | undefined ?? value;
}

// JSON doesn't guarantee the order of object keys. This is kinda not ideal as the references require the referenced entities to be already deserialized.
// However, we can fix this by sorting the object keys. Best of all, if the order is preserved, no sorting is even required.
//
// Let x, y be two children of object O where x comes before y in the object's key order.
// For any x, ref_x is the set of all references in x, while id_x is the set of all ids in x.
// Let's say that the order of object O is not valid (denoted as \neq OK(O)) iff there exists an ordered pair of children (x, y) of O and a value r such that r \in ref_x and r \in id_y, or if \neq OK(z) for some child z of O.
//
// Let's specify the min and max functions on empty sets as min({}) = infinity and max({}) = -infinity.
// Then, we say that (x, y) is in a valid order (denoted as OK(x, y)) <=> max(ref_x) < min(id_y).
// Theorem: OK(O) <= OK(x, y) holds for all ordered pairs of children (x, y) of O and OK(z) holds for all children z of O.
//
// Proof:
// If any of the sets is empty, the "<" condition is trivially satisfied. This still means that id_x can have a larger value than id_y, which implies different-than-original order. However, this does not break the references so we consider it as valid.
// The "=>" direction does not generally hold - we can have an object O with children x, y such that id_x = { 2 }, ref_x = { 2 }, id_y = { 1 }, ref_y = { 1 }. Then, OK(O) holds but OK(x, y) does not hold.
// However, we are intereseted in the "<=" direction. That follows from the fact that the "<" condition forbids any common values between ref_x and id_y.
//
// Because of the trivial case, we can't simply check only the consecutive pairs of children - e.g., invalid non-consecutive pairs can be interleaved with children with empty sets. However, we can use induction to show that using the running max of ref_x instead of max(ref_x) is sufficient to satisfy the condition for all pairs.

type SortingResult = {
    /** The minimal declared id of any explored entity. */
    minId: number;
    /** The maximal used reference of any explored entity. */
    maxRef: number;
    /**
     * If defined, the entity was modified by sorting and this value must be used instead.
     * Might be an array (arrays are not sorted, but they are copied if any of their children are modified).
     */
    sortedEntity?: JsonEntity;
};

// The infimum and supremum of the EntityId type.
const EMPTY_SET_MAX = -1;
const EMPTY_SET_MIN = Number.MAX_SAFE_INTEGER;

function processObject(value: JsonObject): SortingResult {
    const annotations = value[ESCAPE_CHAR] as Annotations | undefined;
    const childResults: SortingResult[] = [];

    const keys = Object.keys(value);
    const keysLength = keys.length;
    for (let i = 0; i < keysLength; i++) {
        let key = keys[i];
        const item = value[key];

        validateObjectKey(key);

        if (key[0] === ESCAPE_CHAR) {
            if (key === ESCAPE_CHAR)
                continue;

            key = unescapeKey(key);
        }

        const childResult = processObjectProperty(item, annotations?.[key]);
        if (childResult !== undefined)
            childResults.push(childResult);
    }

    // The happy path - all children are in a valid order, no need to sort them.
    // Should be the case in vast majority of use cases.
    // In fact, you are probably doint something utterly deranged if you are not hitting this case.
    // But don't worry we got you covered :)
    // (OK, JCS [RFC 8785](https://www.rfc-editor.org/info/rfc8785/) might actually be a valid use case.)
    const result = checkObjectKeyOrder(childResults);
    if (result !== undefined)
        return result;

    // Let's get hte min and max values here, where even the escaped property is included.
    let minId = EMPTY_SET_MIN;
    let maxRef = EMPTY_SET_MAX;

    const resultsLength = childResults.length;
    for (let i = 0; i < resultsLength; i++) {
        const childResult = childResults[i];

        minId = Math.min(minId, childResult.minId);
        maxRef = Math.max(maxRef, childResult.maxRef);
    }

    return {
        minId,
        maxRef,
        sortedEntity: sortObjectKeys(value, annotations, childResults),
    };
}

/** @returns undefined if the property doesn't affect the sorting order, SortingResult otherwise. */
function processObjectProperty(value: JsonValue, annotationOrComposite: Annotations[string] | undefined): SortingResult | undefined {
    // References are trivial and primitives don't matter for anything.
    if (annotationOrComposite === REFERENCE_ANNOTATION)
        return { minId: EMPTY_SET_MIN, maxRef: value as EntityId };
    if (typeof value !== 'object' || value === null)
        return undefined;

    let childResult: SortingResult | undefined;
    let annotation: Annotation | undefined;

    if (Array.isArray(value)) {
        let compositeIterator: CompositeAnnotationIterator | undefined;

        if (annotationOrComposite !== undefined) {
            compositeIterator = new CompositeAnnotationIterator(annotationOrComposite as CompositeAnnotation);
            annotation = compositeIterator.next();
        }

        childResult = processArray(value, compositeIterator);
    }
    else {
        annotation = annotationOrComposite as Annotation | undefined;
        childResult = processObject(value);
    }

    const entityId = parseEntityIdFromAnnotation(annotation);
    if (entityId !== undefined)
        childResult.minId = Math.min(childResult.minId, entityId);

    return childResult;
}

function processArray(value: JsonArray, compositeIterator: CompositeAnnotationIterator | undefined): SortingResult {
    let minId = EMPTY_SET_MIN;
    let maxRef = EMPTY_SET_MAX;
    let copiedArray: JsonArray | undefined;

    const length = value.length;
    for (let i = 0; i < length; i++) {
        const annotation = compositeIterator?.next();
        const item = value[i];

        // References are trivial and primitives don't matter for anything.
        if (annotation === REFERENCE_ANNOTATION) {
            maxRef = Math.max(maxRef, item as EntityId);
            continue;
        }
        if (typeof item !== 'object' || item === null)
            continue;

        const childResult = Array.isArray(item)
            ? processArray(item, compositeIterator)
            : processObject(item);

        const entityId = parseEntityIdFromAnnotation(annotation);
        if (entityId !== undefined)
            childResult.minId = Math.min(childResult.minId, entityId);

        minId = Math.min(minId, childResult.minId);
        maxRef = Math.max(maxRef, childResult.maxRef);

        if (copiedArray === undefined) {
            // No sorting yet - let's see if we can keep it that way.
            if (childResult.sortedEntity !== undefined) {
                // No, there is a modification - the whole array needs to be copied. Luckily, we don't have to sort it, but we still have to copy it to not modify the original array.
                // NICE_TO_HAVE If we ever add an option to modify the original array, we can skip this copy.
                copiedArray = value.slice(0, i);
                copiedArray.push(childResult.sortedEntity);
            }
        }
        else {
            // We are already sorting (at least some elements) - let's keep copying.
            copiedArray.push(childResult.sortedEntity ?? item);
        }
    }

    return {
        minId,
        maxRef,
        sortedEntity: copiedArray,
    };
}

function parseEntityIdFromAnnotation(annotation: Annotation | undefined): EntityId | undefined {
    switch (typeof annotation) {
        case 'string':
            return undefined;
        case 'number':
            return annotation;
        case 'object':
            return annotation[1];
    }
}

/** @returns SortingResult if the object keys are in the correct order, undefined otherwise. */
function checkObjectKeyOrder(childResults: SortingResult[]): SortingResult | undefined {
    let minId = EMPTY_SET_MIN;
    let maxRef = EMPTY_SET_MAX;

    const length = childResults.length;
    for (let i = 0; i < length; i++) {
        const childResult = childResults[i];

        // A new value was created for a child - something was out of order - the whole thing probably needs to be sorted.
        if (childResult.sortedEntity !== undefined)
            return undefined;

        // Based directly on the above-described algorithm.
        if (maxRef >= childResult.minId)
            return undefined;

        minId = Math.min(minId, childResult.minId);
        maxRef = Math.max(maxRef, childResult.maxRef);
    }

    return {
        minId,
        maxRef,
    };
}

type SortingProperty = SortingResult & { key?: string };

function sortObjectKeys(value: JsonObject, annotations: Annotations | undefined, childResults: SortingProperty[]): JsonObject {
    const sortedEntity: JsonObject = {};

    // Let's start by adding keys to the properties so that we can sort them.
    let i = 0;

    const keys = Object.keys(value);
    const keysLength = keys.length;
    for (let j = 0; j < keysLength; j++) {
        const key = keys[j];
        const item = value[key];

        if (key === ESCAPE_CHAR)
            continue;

        // Only references and non-primitives were included in the childResults.
        if (annotations?.[key] === REFERENCE_ANNOTATION || typeof item === 'object' && item !== null) {
            childResults[i].key = key;
            i++;
        }
        else {
            // Primitives can be just copied. This mean they will appear before any of the other childResults, but that's ok since they don't depend on anything.
            sortedEntity[key] = item;
        }
    }

    if (annotations !== undefined)
        sortedEntity[ESCAPE_CHAR] = annotations;

    // Finally, we can sort the properties and add them to the final object.
    childResults.sort(compareSortingResults);

    const resultsLength = childResults.length;
    for (let i = 0; i < resultsLength; i++) {
        const childResult = childResults[i];
        // All keys have to be defined at this point.
        const key = childResult.key!;
        sortedEntity[key] = childResult.sortedEntity ?? value[key];
    }

    return sortedEntity;
}

function compareSortingResults(a: SortingResult, b: SortingResult): number {
    return a.maxRef < b.minId ? -1 : b.maxRef < a.minId ? 1 : 0;
}

class CompositeAnnotationIterator {
    private readonly annotation: CompositeAnnotation;
    private index = -1;

    constructor(annotation: CompositeAnnotation) {
        this.annotation = annotation;
    }

    next(): Annotation | undefined {
        this.index++;
        return this.annotation[this.index];
    }
}
