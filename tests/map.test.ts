/** The first map: a fixed spiral route between two portals side by side. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, ROUTE_NODES, buildGrid, routeLength } from '../src/data/map.ts';
import { flowField, walk, type Grid } from '../src/systems/pathfinding.ts';

test('the route is one unbroken chain of neighbouring nodes that never repeats', () => {
  const seen = new Set<string>();
  ROUTE_NODES.forEach(([c, r], i) => {
    const key = `${c},${r}`;
    assert.ok(!seen.has(key), `node ${key} used twice`);
    seen.add(key);
    if (i > 0) {
      const [pc, pr] = ROUTE_NODES[i - 1];
      assert.equal(Math.abs(pc - c) + Math.abs(pr - r), 1, `gap between ${pc},${pr} and ${key}`);
    }
  });
});

test('the two portals stand side by side on the top edge', () => {
  const [s, e] = [ROUTE_NODES[0], ROUTE_NODES.at(-1)!];
  assert.equal(s[1], 0);
  assert.equal(e[1], 0);
  assert.equal(Math.abs(s[0] - e[0]), 1);
});

test('lanes only touch where the route continues: the lane cells form one corridor from portal to portal', () => {
  const kinds = buildGrid();
  const grid: Grid = { cols: MAP.cols, rows: MAP.rows, blocked: Uint8Array.from(kinds, (k) => (k === 'lane' ? 0 : 1)) };
  const [s, e] = [ROUTE_NODES[0], ROUTE_NODES.at(-1)!];
  const startCol = s[0] * 4 + 2;
  const endCol = e[0] * 4 + 2;
  const path = walk(grid, flowField(grid, endCol, 0), startCol, 0);
  assert.ok(path, 'red portal reachable from blue over lanes');
  // if lanes touched anywhere else, creeps could shortcut: the corridor walk must be close to the full route
  assert.ok(path.length > routeLength() * 0.9, `shortest lane walk ${path.length} vs route ${routeLength().toFixed(0)}`);
});

test('the route is long and the map is compact', () => {
  assert.ok(routeLength() > 190, `route ${routeLength()}`);
  assert.ok(MAP.cols * MAP.rows < 1100);
  const grass = buildGrid().filter((k) => k === 'grass').length;
  assert.ok(grass > 450, `grass cells ${grass}`);
});
