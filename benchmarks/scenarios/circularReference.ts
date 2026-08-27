import type { Scenario } from '../measure.js';

export function circularReferenceScenario(): Scenario {
    return {
        id: 'circular-reference',
        name: 'Circular Reference',
        description: 'A cyclic object graph with arrays, sets, and maps referencing each other.',
        skipSerializers: [ 'JSON', 'uberjson', 'superjson' ],
        iterations: 100,
        batches: 100,
        getData: createCircularReference,
    };
}

type CircularReference = {
    root: Record<string, unknown>;
};

function createCircularReference(): CircularReference {
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
