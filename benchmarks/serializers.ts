import { PowerJson } from '../src/powerJson.ts';
import SuperJson from 'superjson';
import * as devalue from 'devalue';
import serializeJavascript from 'serialize-javascript';
import { NJSON } from 'next-json';
import { createSerializer } from './utils.ts';

export function jsonSerializer() {
    return createSerializer('JSON', {
        stringify: value => JSON.stringify(value),
        parse: json => JSON.parse(json),
    });
}

export function powerJsonSerializer({ deduplicate }:{ deduplicate: boolean }) {
    const name = `powerjson v${deduplicate ? '2' : '1'}`;
    const powerJson = new PowerJson({ deduplicate });

    return createSerializer(name, {
        stringify: value => powerJson.stringify(value),
        parse: json => powerJson.parse(json),
        serialize: value => powerJson.serialize(value),
        deserialize: serialized => powerJson.deserialize(serialized),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}

export function superJsonSerializer({ deduplicate }:{ deduplicate: boolean }) {
    // https://github.com/ravionhq/superjson
    const name = `superjson v${deduplicate ? '2' : '1'}`;
    const superJson = new SuperJson({ dedupe: deduplicate });

    return createSerializer(name, {
        stringify: value => superJson.stringify(value),
        parse: json => superJson.parse(json),
        serialize: value => superJson.serialize(value),
        deserialize: serialized => superJson.deserialize(serialized, { inPlace: true }),
        toJson: serialized => JSON.stringify(serialized),
        fromJson: json => JSON.parse(json),
    });
}

export function devalueSerializer() {
    // https://github.com/sveltejs/devalue
    return createSerializer('devalue', {
        stringify: value => devalue.stringify(value),
        parse: json => devalue.parse(json),
    });
}

export function serializeJavascriptSerializer() {
    // https://github.com/yahoo/serialize-javascript
    return createSerializer('serialize-javascript', {
        stringify: value => serializeJavascript(value, {
            // No need for the extra security, we are not doing anything stupid like pasting the serialized code into a webpage ...
            unsafe: true,
            // Do you think setting this to false would make it faster? No, it actually makes it a lot slower! Instead of just ignoring the functions, it tries to delete them from the input.
            ignoreFunction: false,
            // Contrary to the documentation, setting this to true would also skip other types like Date, Set, Map, etc. Our hands are tied.
            isJSON: false,
        }),
        // eslint-disable-next-line no-eval -- Yeah, imagine you create a serializer to some custom format and your users want to deserialize it back! How dare they? So anyway, you don't provide a parser, you just tell them to use eval instead! What an absolute fucking legend. I love getting hacked :3
        parse: json => eval('(' + json + ')'),
    });
}

export function nextJsonSerializer() {
    // https://github.com/iccicci/next-json
    return createSerializer('next-json', {
        stringify: value => NJSON.stringify(value),
        parse: json => NJSON.parse(json),
    });
}
