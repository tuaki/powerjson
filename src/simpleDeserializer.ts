import { Deserializer } from './deserializer.js';
import type { Annotation, EntityId, TypeId } from './json.js';
import type { ObjectLike } from './transformers.js';

export class SimpleDeserializer extends Deserializer {
    // #region Annotations

    protected override parseAnnotation(annotation: Annotation) {
        // Simple serialization doesn't store entity ids in annotations, so they are always strings.
        return annotation as TypeId;
    }

    // #endregion
    // #region References

    /** A stack of all output entities we are nested to. */
    private readonly pathEntities: ObjectLike[] = [];

    protected override trySetReference(value: ObjectLike) {
        this.pathEntities.push(value);
    }

    protected override cleanupReference() {
        this.pathEntities.pop();
    }

    protected override getReference(entityId: EntityId) {
        // A reference is just an index from the output root.
        const entity = this.pathEntities[entityId];
        if (entity === undefined)
            throw new Error(`Reference not found: ${entityId}.`);

        return entity;
    }

    // #endregion
}
