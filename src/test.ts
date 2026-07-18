import { Deserializer } from './deserializer.js';
import { Serializer } from './serializer.js';

const basicTypes = {
    'string': 'a',
    'number': 1,
    'boolean': true,
    'null': null,
    'Array': [],
    'Object': {},
    // Supported by superjson:
    'undefined': undefined,
    'bigint': 1n,
    'Date': new Date(),
    'RegExp': /abc/,
    'Set': new Set([ 1 ]),
    'Map': new Map([ [ 1, 'a' ] ]),
    // 'URL': new URL('https://url.com'),
    // 'Error': new Error('message'),
    'NaN': NaN,
    'plusInfinity': Infinity,
    'minusInfinity': -Infinity,
    'negativeZero': -0,
};

const a = {};

const serializer = new Serializer();

const object = {
    a,
    b: a,
    c: {
        d: {
            a,
        },
    },
    basicTypes,
};

const result = serializer.serializeReference(object);

console.log(result);

const deserializer = new Deserializer();

console.log(deserializer.deserializeReference(result));
