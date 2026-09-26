import { REFERENCE_ANNOTATION } from './json.ts';
import { Serializer } from './serializer.ts';
import type { ObjectLike } from './transformers.ts';

export class SimpleSerializer extends Serializer {
    // #region Annotations

    protected override finalizeAnnotations() {
        // Nothing to do here, we have already processed all annotations.
    }

    protected override storeEmptyAnnotation() {
        // Nothing to do here - there is no way to add anything to an empty annotations object, so we can just skip it.
    }

    // #endregion
    // #region References

    /** A stack of all input entities we are nested to. */
    private readonly pathEntities: ObjectLike[] = [];
    // Yes, array scan is O(n), but for small numbers of references (which is definitely the most common case), it's probably much faster than a Map.

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
