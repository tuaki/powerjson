import { ESCAPE_KEY, REFERENCE_ANNOTATION, type AnnotatedJsonObject } from './json.js';
import { Serializer } from './serializer.js';
import type { ObjectLike } from './transformers.js';

export class SimpleSerializer extends Serializer {
    // #region Annotations

    protected override cleanupAnnotations(value: AnnotatedJsonObject) {
        if (Object.keys(value[ESCAPE_KEY]!).length === 0)
            delete value[ESCAPE_KEY];
    }

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
