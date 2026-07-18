type Defined<T> = T extends undefined ? never : T;

export function ensureProperty<
    TObject extends Record<string, unknown>,
    TKey extends keyof TObject,
>(object: TObject, key: TKey, defaultValue: Defined<TObject[TKey]>): Defined<TObject[TKey]> {
    let value = object[key];
    if (value === undefined) {
        value = defaultValue;
        object[key] = value;
    }

    return value as Defined<TObject[TKey]>;
}
