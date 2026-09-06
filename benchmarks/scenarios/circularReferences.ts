import type { Scenario } from '../utils.ts';

export function circularReferencesScenario(): Scenario {
    return {
        id: 'circular-references',
        name: 'Circular References',
        description: 'A cyclic object graph with arrays, sets, and maps referencing each other.',
        // There is actually a bug in superJson. (Another one ... I know, right?)
        // Their serializer caches transformed results for all objects it sees. If it sees the same object again, it will either return a reference (if `dedupe: true`) or the cached result.
        // However, if `dedupe: false`, serialization depends on the path to the object - because the path is used to break cycles. So, an object like `a: { b: { c: a } }` should break the cycle when encountering `a` for the second time, while the same cycle but starting from `b` should break the cycle at `b`.
        // PowerJson always expands the objects as deep as possible, which results in an exponential growth on this specific scenario. Nevertheless, this is a very artificial scenario. In this case, the only reasonable way is to deduplicate - in which case, unfortunately, superJson throws an error.
        skipSerializers: [ 'JSON', 'uberson-simple' ],
        iterations: 100,
        batches: 100,
        getData: createCircularReferences,
    };
}

type CircularReference = {
    root: Record<string, unknown>;
};

function createCircularReferences(): CircularReference {
    const root: Record<string, unknown> = { name: 'root' };

    const nodeA: Record<string, unknown> = { name: 'node-a', root };
    const nodeB: Record<string, unknown> = { name: 'node-b', root };
    const nodeC: Record<string, unknown> = { name: 'node-c', root };
    const nodeD: Record<string, unknown> = { name: 'node-d', root };

    const list1: unknown[] = [ root, nodeA, nodeB ];
    const list2: unknown[] = [ nodeC, nodeD, root, list1 ];

    const set1 = new Set<unknown>([ root, nodeA, nodeB, list1 ]);
    const set2 = new Set<unknown>([ nodeC, nodeD, list2, set1 ]);

    const map1 = new Map<unknown, unknown>([
        [ root, nodeA ],
        [ nodeA, nodeB ],
        [ nodeB, set1 ],
        [ list1, nodeC ],
    ]);

    const map2 = new Map<unknown, unknown>([
        [ nodeC, nodeD ],
        [ nodeD, map1 ],
        [ list2, set2 ],
        [ set1, root ],
    ]);

    root.nodeA = nodeA;
    root.nodeB = nodeB;
    root.nodeC = nodeC;
    root.nodeD = nodeD;
    root.list1 = list1;
    root.list2 = list2;
    root.set1 = set1;
    root.set2 = set2;
    root.map1 = map1;
    root.map2 = map2;

    nodeA.sibling = nodeB;
    nodeA.next = nodeC;
    nodeA.back = root;
    nodeB.sibling = nodeC;
    nodeB.next = nodeD;
    nodeB.parent = root;
    nodeC.sibling = nodeD;
    nodeC.prev = nodeA;
    nodeC.parent = root;
    nodeD.sibling = nodeA;
    nodeD.prev = nodeB;
    nodeD.parent = root;

    list1.push(nodeC, set1, map1, root);
    list2.push(nodeA, set2, map2, nodeB);

    set1.add(nodeC);
    set1.add(map1);
    set1.add(list2);

    set2.add(nodeA);
    set2.add(map2);
    set2.add(root);

    map1.set(nodeC, list2);
    map1.set(set1, map2);
    map1.set(map2, nodeD);

    map2.set(root, list1);
    map2.set(nodeA, set1);
    map2.set(list1, nodeC);

    root.self = root;
    root.allNodes = [ nodeA, nodeB, nodeC, nodeD ];
    root.meta = {
        primary: map1,
        secondary: map2,
        rings: [ list1, list2, set1, set2 ],
    };

    return { root };
}
