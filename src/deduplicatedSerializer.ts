import { REFERENCE_ANNOTATION, type AnnotatedJsonObject, type TypeId, type Annotations, type JsonObject, type EntityId, type CompositeAnnotation } from './json.ts';
import { deleteEscapeKeyIfEmpty, Serializer } from './serializer.ts';
import type { ObjectLike } from './transformers.ts';

export class DeduplicatedSerializer extends Serializer {
    override serialize(value: unknown): JsonObject {
        const serialized = super.serialize(value);

        addIdentityAnnotations(this.seenEntities);

        this.cleanupEmptyAnnotations();

        return serialized;
    }

    // #region Annotations

    // The annotation cleanup is delayed until the end of serialization because we need to know if an entity is referenced or not. If it is, we need to add an identity annotation to it, which means that the annotations object will not be empty.

    private cleanupEmptyAnnotations() {
        const allJsonObjects = this.allJsonObjects;
        const length = allJsonObjects.length;
        for (let i = 0; i < length; i++)
            deleteEscapeKeyIfEmpty(allJsonObjects[i]);
    }

    private readonly allJsonObjects: JsonObject[] = [];

    protected override cleanupAnnotations(value: AnnotatedJsonObject) {
        this.allJsonObjects.push(value);
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
