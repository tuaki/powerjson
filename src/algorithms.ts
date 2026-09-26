import type { JsonObject, SerializedValue } from './json.ts';
import type { PowerJsonConfig } from './config.ts';
import type { Serializer } from './serializer.ts';
import { SimpleSerializer } from './simpleSerializer.ts';
import { DeduplicatedSerializer } from './deduplicatedSerializer.ts';
import { type Deserializer, getAlgorithmVersion } from './deserializer.ts';
import { SimpleDeserializer } from './simpleDeserializer.ts';
import { DeduplicatedDeserializer } from './deduplicatedDeserializer.ts';

// This actually returny SerializedValue, but we don't want to expose that type to the public API.
// So, a generic JsonObject is used instead.
export function serialize(input: unknown, config: PowerJsonConfig): JsonObject {
    let serializer: Serializer | undefined;

    switch (config.version) {
        case 1:
            serializer = new SimpleSerializer(config);
            break;
        case 2:
            serializer = new DeduplicatedSerializer(config);
            break;
    }

    return serializer.serialize(input);
}

export function deserialize<TOutput = unknown>(jsonValue: JsonObject, config: PowerJsonConfig): TOutput {
    const serialized = jsonValue as SerializedValue;

    let deserializer: Deserializer | undefined;

    switch (getAlgorithmVersion(serialized)) {
        case 1:
            deserializer = new SimpleDeserializer(config);
            break;
        case 2:
            deserializer = new DeduplicatedDeserializer(config);
            break;
    }

    return deserializer.deserialize(serialized) as TOutput;
}
