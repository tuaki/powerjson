import type { JsonObject } from './json.ts';
import { PowerJsonConfig, type PowerJsonOptions } from './config.ts';
import { serialize, deserialize } from './algorithms.ts';

// This class is in a separate file from the algorithms to enable tree shaking.

/**
 * A convenience class for both serialization and deserialization, with a single configuration.
 */
export class PowerJson {
    readonly config: PowerJsonConfig;

    constructor(options: PowerJsonOptions = {}) {
        this.config = new PowerJsonConfig(options);
    }

    serialize(input: unknown): JsonObject {
        return serialize(input, this.config);
    }

    deserialize<T = unknown>(jsonValue: JsonObject): T {
        return deserialize<T>(jsonValue, this.config);
    }

    stringify(input: unknown): string {
        return JSON.stringify(this.serialize(input), undefined, this.config.space);
    }

    parse<T = unknown>(jsonString: string): T {
        return this.deserialize(JSON.parse(jsonString)) as T;
    }

    private static defaultInstance = new PowerJson();

    static serialize = PowerJson.defaultInstance.serialize.bind(PowerJson.defaultInstance);
    static deserialize = PowerJson.defaultInstance.deserialize.bind(PowerJson.defaultInstance);
    static stringify = PowerJson.defaultInstance.stringify.bind(PowerJson.defaultInstance);
    static parse = PowerJson.defaultInstance.parse.bind(PowerJson.defaultInstance);
}
