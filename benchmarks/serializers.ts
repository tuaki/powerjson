import type SuperJson from 'superjson';
import { type UberJson } from '../src/uberJson.js';
import { createSerializer } from './measure.js';

export function jsonSerializer() {
    return createSerializer('JSON', {
        serialize: value => value,
        deserialize: value => value,
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}

export function uberJsonSerializer(name: string, serializer: UberJson) {
    return createSerializer(name, {
        serialize: value => serializer.serialize(value),
        deserialize: serialized => serializer.deserialize(serialized),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}

export function superJsonSerializer(name: string, serializer: SuperJson) {
    return createSerializer(name, {
        serialize: value => serializer.serialize(value),
        deserialize: serialized => serializer.deserialize(serialized, { inPlace: true }),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}
