import type { JsonObject, RootJsonObject } from './json.ts';
import type { PowerJsonConfig } from './config.ts';
import type { Serializer } from './serializer.ts';
import { SimpleSerializer } from './simpleSerializer.ts';
import { DeduplicatedSerializer } from './deduplicatedSerializer.ts';
import { type Deserializer, getAlgorithmVersion } from './deserializer.ts';
import { SimpleDeserializer } from './simpleDeserializer.ts';
import { DeduplicatedDeserializer } from './deduplicatedDeserializer.ts';

export function serialize(value: unknown, config: PowerJsonConfig): JsonObject {
    let serializer: Serializer | undefined;

    switch (config.version) {
        case 1:
            serializer = new SimpleSerializer(config);
            break;
        case 2:
            serializer = new DeduplicatedSerializer(config);
            break;
    }

    return serializer.serialize(value);
}

export function deserialize<T = unknown>(jsonValue: JsonObject, config: PowerJsonConfig): T {
    const value = jsonValue as RootJsonObject;

    let deserializer: Deserializer | undefined;

    switch (getAlgorithmVersion(value)) {
        case 1:
            deserializer = new SimpleDeserializer(config);
            break;
        case 2:
            deserializer = new DeduplicatedDeserializer(config);
            break;
    }

    return deserializer.deserialize(value) as T;
}
