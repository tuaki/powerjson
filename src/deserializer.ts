import type { Annotation, Annotations, JsonArray, JsonObject, JsonValue } from './json.js';
import { stringifyPath, type Path, type StringifiedPath } from './path.js';
import { Serializer, type ObjectLike, type Primitive } from './serializer.js';

export class Deserializer {
    constructor() {}

    deserialize(jsonObject: JsonObject) {
        // TODO unwrap if needed
        return this.deserializeObject(jsonObject);
    }

    private readonly rootToParent: Path = [];
    private parentToValue: Path = [];

    annotations: Annotations<typeof Serializer.ESCAPE_KEY> | undefined;

    private getAnnotation(): Annotation | undefined {
        if (!this.annotations)
            return undefined;

        const key = stringifyPath(this.parentToValue);
        return this.annotations[key];
    }

    private readonly allReferences = new Map<StringifiedPath, ObjectLike>();

    private setReference(value: ObjectLike): void {
        this.allReferences.set(stringifyPath([ ...this.rootToParent, ...this.parentToValue ]), value);
    }

    private deserializeReference(annotation: Annotation): ObjectLike {
        if (!Array.isArray(annotation) || annotation.length !== 2)
            throw new Error(`Invalid reference annotation: ${annotation}`);

        const reference = annotation[1];

        // We expect the json to be deserialized in the same order as it was serialized. I.e., when we encounter a reference, it should have already been deserialized and stored in the referenceIdentities map.
        // If this is not true, things will get whole lot more complicated. Basically, set/map objects can have references as keys (or values). We want to preserve the order of the keys (because JS does preserve it), so we need to put the keys there in the same order as they were serialized (they are serialized as arrays, so the order is preserved in JSON).
        // Therefore, we would have to probably first construct all objects to fill the reference map and only after then start filling in the values.

        if (typeof reference !== 'string')
            throw new Error(`Invalid reference: ${reference}`);

        const referencedValue = this.allReferences.get(reference);
        if (!referencedValue)
            throw new Error(`Reference not found: ${reference}`);

        return referencedValue;
    }

    // TODO Should be working but I am not sure string paths are correctly escaped / unescaped.

    private deserializeChild(value: JsonValue, key: string): ObjectLike | Primitive {
        this.parentToValue.push(key);

        let output: ObjectLike | Primitive;

        const annotation = this.getAnnotation();
        if (annotation !== undefined)
            output = this.deserializeAnnotatedValue(value, annotation);
        else if (typeof value !== 'object' || value === null)
            output = value;
        else if (Array.isArray(value))
            output = this.deserializeArray(value);
        else
            output = this.deserializeObject(value);

        this.parentToValue.pop();
        return output;
    }

    // TODO rename
    // TODO fix annotation types?
    private deserializeObject(value: JsonObject): ObjectLike {
        const output = {} as Record<string, unknown>;
        this.setReference(output);

        const prevPathFromParent = this.parentToValue;
        this.rootToParent.push(...prevPathFromParent);
        this.parentToValue = [];

        this.annotations = value[Serializer.ESCAPE_KEY] as Annotations<typeof Serializer.ESCAPE_KEY> | undefined;

        for (const [ key, item ] of Object.entries(value)) {
            if (key === Serializer.ESCAPE_KEY)
                continue;

            output[key] = this.deserializeChild(item, key);
        }

        // TODO if annotations have control object ...

        this.parentToValue = prevPathFromParent;
        this.rootToParent.splice(this.rootToParent.length - this.parentToValue.length, this.parentToValue.length);

        return output;
    }

    private deserializeArray(value: JsonArray): ObjectLike {
        const output = Array(value.length);
        this.setReference(output);

        for (let i = 0; i < value.length; i++)
            output[i] = this.deserializeChild(value[i], String(i));

        return output;
    }

    private deserializeAnnotatedValue(value: JsonValue, annotation: Annotation): ObjectLike | Primitive {
        const type = typeof annotation === 'string' ? annotation : annotation[0];

        switch (type) {
            case Serializer.REFERENCE_ANNOTATION:
                return this.deserializeReference(annotation);
            case Serializer.SET_ANNOTATION:
                return this.deserializeSet(value as JsonArray);
            case Serializer.MAP_ANNOTATION:
                return this.deserializeMap(value as [JsonValue, JsonValue][]);
            case Serializer.UNDEFINED_ANNOTATION:
                return undefined;
            case Serializer.NUMBER_ANNOTATION:
                return this.deserializeNumber(value as string);
            case Serializer.BIGINT_ANNOTATION:
                if (typeof value !== 'string')
                    throw new Error(`Invalid bigint value: ${value}`);

                return BigInt(value);
            case Serializer.DATE_ANNOTATION:
                if (typeof value !== 'string')
                    throw new Error(`Invalid date value: ${value}`);

                return new Date(value);
            case Serializer.REGEXP_ANNOTATION:
                return this.deserializeRegExp(value as string);
            default:
                // TODO deserialize custom type
                return this.deserializeCustomType(value, annotation);
        }
    }

    private deserializeSet(value: JsonArray): Set<unknown> {
        const output = new Set();
        this.setReference(output);

        let i = 0;
        for (const item of value) {
            output.add(this.deserializeChild(item, String(i)));
            i++;
        }
        return output;
    }

    private deserializeMap(value: [JsonValue, JsonValue][]): Map<unknown, unknown> {
        const output = new Map();
        this.setReference(output);

        let i = 0;
        for (const [ key, item ] of value) {
            this.parentToValue.push(String(i));

            output.set(
                this.deserializeChild(key, '0'),
                this.deserializeChild(item, '1'),
            );

            this.parentToValue.pop();
            i++;
        }

        return output;
    }

    private deserializeNumber(value: string): number {
        switch (value) {
            case Serializer.PLUS_INFINITY:
                return Infinity;
            case Serializer.MINUS_INFINITY:
                return -Infinity;
            case Serializer.NAN:
                return NaN;
            case Serializer.NEGATIVE_ZERO:
                return -0;
            default:
                throw new Error(`Invalid number value: ${value}`);
        }
    }

    private deserializeRegExp(value: string): RegExp {
        const body = value.slice(1, value.lastIndexOf('/'));
        const flags = value.slice(value.lastIndexOf('/') + 1);
        return new RegExp(body, flags);
    }

    private deserializeURL(value: string): URL {
        return new URL(value);
    }

    private deserializeCustomType(value: JsonValue, annotation: Annotation): ObjectLike {
        // TODO if needed.
        // this.setReference(output);
        // TODO
        return null;
    }
}
