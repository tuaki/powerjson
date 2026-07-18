export type StringifiedPath = string;
export type Path = string[];

export function escapeKey(key: string) {
    return key.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}

export function stringifyPath(path: Path): StringifiedPath {
    return path
        .map(escapeKey)
        .join('.');
}

export function parsePath(string: StringifiedPath) {
    const result: string[] = [];

    let segment = '';
    for (let i = 0; i < string.length; i++) {
        const char = string.charAt(i);

        if (char === '\\') {
            const escaped = string.charAt(i + 1);
            if (escaped === '\\') {
                segment += '\\';
                i++;
                continue;
            }
            else if (escaped !== '.') {
                throw Error('invalid path');
            }
        }

        const isEscapedDot = char === '\\' && string.charAt(i + 1) === '.';
        if (isEscapedDot) {
            segment += '.';
            i++;
            continue;
        }

        const isEndOfSegment = char === '.';
        if (isEndOfSegment) {
            result.push(segment);
            segment = '';
            continue;
        }

        segment += char;
    }

    const lastSegment = segment;
    result.push(lastSegment);

    return result;
};
