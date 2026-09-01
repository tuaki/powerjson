import { REFERENCE_ANNOTATION } from './json.ts';
import { deleteEscapeKeyIfEmpty, Serializer } from './serializer.ts';
import type { ObjectLike } from './transformers.ts';

export class SimpleSerializer extends Serializer {
    // #region Annotations

    protected override cleanupAnnotations = deleteEscapeKeyIfEmpty;

    // #endregion
    // #region References

    /** A stack of all input entities we are nested to. */
    private readonly pathEntities: ObjectLike[] = [];
    // Yes, arrays scan is O(n), but for small numbers of references (which is definitely the most common case), it's probably much faster than a Map.

    protected override trySetReference(value: ObjectLike) {
        const index = this.pathEntities.indexOf(value);
        if (index !== -1) {
            this.addAnnotation(REFERENCE_ANNOTATION);
            // The index was the reference id all along. Who would have thought.
            return index;
        }

        this.pathEntities.push(value);
    }

    protected override cleanupReference() {
        this.pathEntities.pop();
    }

    // #endregion
}
