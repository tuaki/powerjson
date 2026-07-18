import { Deserializer } from './deserializer.js';
import type { JsonArray, JsonObject } from './json.js';
import { Serializer } from './serializer.js';

class UberJson {
    serialize(value: unknown): JsonObject | JsonArray | null {
        const serializer = new Serializer();
        // TODO
        return serializer.serialize(value);
    }

    deserialize(jsonObject: JsonObject) {
        const deserializer = new Deserializer();
        // TODO
        return deserializer.deserialize(jsonObject);
    }

    stringify(value: unknown, space?: string | number): string {
        return JSON.stringify(this.serialize(value), undefined, space);
    }

    parse<T = unknown>(string: string): T {
        return this.deserialize(JSON.parse(string)) as T;
    }
}

export const uberJson = new UberJson();
