import { uberJson } from "../src/uberJson.js";

export function stringifyParse(value: unknown): unknown {
    const stringified = uberJson.stringify(value);
    return uberJson.parse(stringified);
}

/** Checks whether all referential equalities (and non-equalities) from `a` are preserved in `b`. */
export function compareReferentialEqualities(a: unknown, b: unknown): boolean {

}

function findAllReferencePaths(value: unknown, output: Map<unknown, string[]>): string[][] {
