import { REFERENCE_ANNOTATION, type AnnotatedJsonObject, type TypeId, type Annotations, type EntityId, type CompositeAnnotation, ESCAPE_CHAR } from './json.ts';
import { isAnnotationsNotEmpty, Serializer } from './serializer.ts';
import type { ObjectLike, PlainObject } from './transformers.ts';

export class DeduplicatedSerializer extends Serializer {
    protected override serializeRootObject(input: PlainObject) {
        const serialized = this.serializePlainObject(input);

        addIdentityAnnotations(this.seenEntities);

        this.addNonEmptyAnnotations();

        return serialized;
    }

    // #region Annotations

    // We don't want empty annotations objects in the output. However, we can't just throw them away because a references might be added to them later. So, we store them all and revisit them later.

    private addNonEmptyAnnotations() {
        const length = this.objectAnnotationPairs.length;
        for (let i = 0; i < length; i += 2) {
            const annotations = this.objectAnnotationPairs[i + 1] as Annotations;

            if (isAnnotationsNotEmpty(annotations)) {
                const value = this.objectAnnotationPairs[i] as AnnotatedJsonObject;
                value[ESCAPE_CHAR] = annotations;
            }
        }
    }

    /** A list of all objects and their corresponding annotations that need to be processed after serialization. */
    private readonly objectAnnotationPairs: (AnnotatedJsonObject | Annotations)[] = [];

    protected override storeEmptyAnnotation(value: AnnotatedJsonObject, annotations: Annotations) {
        this.objectAnnotationPairs.push(value, annotations);
    }

    // #endregion
    // #region References

    private readonly seenEntities = new Map<ObjectLike, EntityData>();

    protected override trySetReference(entity: ObjectLike) {
        const entityData = this.seenEntities.get(entity);

        if (entityData === undefined) {
            // Never seen this one before.
            this.seenEntities.set(entity, {
                id: this.seenEntities.size,
                isReferenced: false,
                // Capture the current context.
                annotations: this.annotations,
                key: this.key,
                compositeIndex: this.compositeIndex,
            });
        }
        else {
            // We have already seen this entity. Deduplication is inevitable.
            entityData.isReferenced = true;
            this.addAnnotation(REFERENCE_ANNOTATION);
            return entityData.id;
        }
    }

    protected override cleanupReference() {
        // Nothing to do here. We don't need to pop the reference because we don't store the path of references. We only store the seen entities and their data.
    }

    // #endregion
}

type EntityData = {
    id: EntityId;
    isReferenced: boolean;

    // Entity context

    /** Undefined for root. */
    annotations: Annotations | undefined;
    /** Undefined for root. */
    key: string | undefined;
    /** Undefined if the entity is not an array / is not a direct child of an array. */
    compositeIndex: number | undefined;
};

function addIdentityAnnotations(seenEntities: Map<ObjectLike, EntityData>) {
    for (const entityData of seenEntities.values()) {
        // The root is always 0, so we don't have to store its referenceId. Like we can't event if we wanted to, because the root has no parent (but we also don't want to).
        if (!entityData.isReferenced || entityData.annotations === undefined)
            continue;

        const { id, annotations, compositeIndex } = entityData;
        // If the annotations object is defined, the key must be defined as well.
        const key = entityData.key!;

        if (compositeIndex === undefined) {
            // If there is no composite index, it must be a simple annotation. However, we are just adding the entityIds so it have to be either type id or nothing.
            const typeId = annotations[key] as TypeId | undefined;
            annotations[key] = typeId === undefined ? id : [ typeId, id ];
            continue;
        }

        // Now it must be a composite annotation. However, it might not exist yet.
        const composite = annotations[key] as CompositeAnnotation | undefined;
        if (composite === undefined) {
            annotations[key] = { [compositeIndex]: id };
        }
        else {
            // Again, only type id or nothing is possible at this point.
            const typeId = composite[compositeIndex] as TypeId | undefined;
            composite[compositeIndex] = typeId === undefined ? id : [ typeId, id ];
        }
    }
}
