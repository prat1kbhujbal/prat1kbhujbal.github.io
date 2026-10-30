// Grid planner for the cursor robot: the page layout is rasterized into an
// occupancy grid, inflated into a costmap, and searched with A* — the same
// pipeline a mobile robot runs over its map, just with headings for walls

const CELL = 10; // px per grid cell
const INSCRIBED = 14; // px, the robot's own radius — any closer is a collision
const INFLATION = 56; // px over which the cost decays back to free space
const DECAY = 0.06; // how quickly that cost falls away with distance
const COST_WEIGHT = 1 / 40; // how strongly the search shies away from inflated cells
const SMOOTH_TOLERANCE = 24; // cost a shortcut may cross when the path is straightened
const SNAP_PULL = 0.25; // how much a blocked goal favours the robot's side when it is moved

const LETHAL = 254; // occupied by an obstacle
const INSCRIBED_COST = 253; // free, but the robot's body would clip the obstacle
const MAX_INFLATED = 252;

const DIAGONAL = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
];

/**
 * Rasterizes obstacle rectangles (viewport px) into a grid and inflates them
 * into a costmap. Returns `{ cols, rows, cost }` with one cost byte per cell.
 */
const buildCostmap = (rects, width, height) => {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const dist = new Float32Array(cols * rows).fill(Infinity);

  rects.forEach(rect => {
    const c0 = Math.max(Math.floor(rect.left / CELL), 0);
    const c1 = Math.min(Math.ceil(rect.right / CELL), cols);
    const r0 = Math.max(Math.floor(rect.top / CELL), 0);
    const r1 = Math.min(Math.ceil(rect.bottom / CELL), rows);
    for (let y = r0; y < r1; y++) {
      dist.fill(0, y * cols + c0, y * cols + c1);
    }
  });

  // Two-pass chamfer transform: distance, in cells, to the nearest obstacle
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let d = dist[i];
      if (x > 0) {
        d = Math.min(d, dist[i - 1] + 1);
      }
      if (y > 0) {
        d = Math.min(d, dist[i - cols] + 1);
        if (x > 0) {
          d = Math.min(d, dist[i - cols - 1] + DIAGONAL);
        }
        if (x < cols - 1) {
          d = Math.min(d, dist[i - cols + 1] + DIAGONAL);
        }
      }
      dist[i] = d;
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      let d = dist[i];
      if (x < cols - 1) {
        d = Math.min(d, dist[i + 1] + 1);
      }
      if (y < rows - 1) {
        d = Math.min(d, dist[i + cols] + 1);
        if (x < cols - 1) {
          d = Math.min(d, dist[i + cols + 1] + DIAGONAL);
        }
        if (x > 0) {
          d = Math.min(d, dist[i + cols - 1] + DIAGONAL);
        }
      }
      dist[i] = d;
    }
  }

  const cost = new Uint8Array(cols * rows);
  for (let i = 0; i < cost.length; i++) {
    const px = dist[i] * CELL;
    if (dist[i] === 0) {
      cost[i] = LETHAL;
    } else if (px <= INSCRIBED) {
      cost[i] = INSCRIBED_COST;
    } else if (px <= INFLATION) {
      cost[i] = Math.round(MAX_INFLATED * Math.exp(-DECAY * (px - INSCRIBED)));
    }
  }

  return { cols, rows, cost };
};

const passable = (map, i) => map.cost[i] < INSCRIBED_COST;

const cellAt = (map, p) => {
  const x = Math.min(Math.max(Math.floor(p.x / CELL), 0), map.cols - 1);
  const y = Math.min(Math.max(Math.floor(p.y / CELL), 0), map.rows - 1);
  return y * map.cols + x;
};

const centreOf = (map, i) => ({
  x: ((i % map.cols) + 0.5) * CELL,
  y: (Math.floor(i / map.cols) + 0.5) * CELL,
});

/** Whether the robot could stand at viewport point `p` without clipping anything. */
const isFree = (map, p) => passable(map, cellAt(map, p));

/**
 * The free cell closest to `from`, searched in growing square rings, with a
 * slight pull towards `towards` so that among the near edges of an obstacle it
 * takes the one on the robot's own side rather than walking round to the far one.
 */
const nearestFree = (map, from, towards) => {
  const fx = from % map.cols;
  const fy = Math.floor(from / map.cols);
  const tx = towards.x / CELL;
  const ty = towards.y / CELL;
  let best = -1;
  let bestScore = Infinity;

  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) {
      return;
    }
    const i = y * map.cols + x;
    if (!passable(map, i)) {
      return;
    }
    const score = Math.hypot(x - fx, y - fy) + SNAP_PULL * Math.hypot(x - tx, y - ty);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  };

  const maxRing = Math.max(map.cols, map.rows);
  // Every cell in ring r scores at least r, so stop once past the best so far
  for (let r = 0; r <= maxRing && r <= bestScore; r++) {
    for (let k = -r; k <= r; k++) {
      consider(fx + k, fy - r);
      consider(fx + k, fy + r);
      if (Math.abs(k) !== r) {
        consider(fx - r, fy + k);
        consider(fx + r, fy + k);
      }
    }
  }
  return best;
};

/** Binary min-heap of cell indices, keyed by their f-score. */
class OpenSet {
  constructor() {
    this.items = [];
    this.keys = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, key) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (keys[up] <= key) {
        break;
      }
      items[i] = items[up];
      keys[i] = keys[up];
      i = up;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop() {
    const { items, keys } = this;
    const top = items[0];
    const item = items.pop();
    const key = keys.pop();
    if (items.length) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= items.length) {
          break;
        }
        if (child + 1 < items.length && keys[child + 1] < keys[child]) {
          child += 1;
        }
        if (keys[child] >= key) {
          break;
        }
        items[i] = items[child];
        keys[i] = keys[child];
        i = child;
      }
      items[i] = item;
      keys[i] = key;
    }
    return top;
  }
}

/** True if the straight line a→b never crosses a cell costlier than its ends allow. */
const clearShot = (map, a, b) => {
  const limit = Math.max(map.cost[a], map.cost[b], SMOOTH_TOLERANCE);
  const ax = a % map.cols;
  const ay = Math.floor(a / map.cols);
  const dx = (b % map.cols) - ax;
  const dy = Math.floor(b / map.cols) - ay;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2);
  for (let k = 1; k < steps; k++) {
    const x = Math.round(ax + (dx * k) / steps);
    const y = Math.round(ay + (dy * k) / steps);
    if (map.cost[y * map.cols + x] > limit) {
      return false;
    }
  }
  return true;
};

/** String-pulls a cell-by-cell path down to the corners that matter. */
const straighten = (map, cells) => {
  const corners = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = i + 1;
    while (j + 1 < cells.length && clearShot(map, cells[i], cells[j + 1])) {
      j += 1;
    }
    corners.push(cells[j]);
    i = j;
  }
  return corners;
};

/**
 * A* from `from` to `to` (viewport px) over the costmap. If either end sits
 * inside an obstacle it is moved to the nearest free cell first. Returns null
 * when there is nowhere free to start or finish; otherwise the search stats,
 * plus `path` (waypoints after the start) and `goal` (where it will actually
 * stop) when a route was found.
 */
const planPath = (map, from, to) => {
  const startedAt = performance.now();
  const { cols, rows, cost } = map;

  let start = cellAt(map, from);
  const startBlocked = !passable(map, start);
  if (startBlocked) {
    start = nearestFree(map, start, to);
  }

  let goal = cellAt(map, to);
  const goalBlocked = !passable(map, goal);
  if (goalBlocked) {
    goal = nearestFree(map, goal, from);
  }

  if (start < 0 || goal < 0) {
    return null;
  }

  const n = cols * rows;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const explored = new Uint8Array(n);
  const open = new OpenSet();

  const gx = goal % cols;
  const gy = Math.floor(goal / cols);
  // Octile distance, never more than the true cost since every step costs at least its length
  const heuristic = i => {
    const dx = Math.abs((i % cols) - gx);
    const dy = Math.abs(Math.floor(i / cols) - gy);
    return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy);
  };

  g[start] = 0;
  open.push(start, heuristic(start));
  let expanded = 0;
  let found = false;

  while (open.size) {
    const i = open.pop();
    if (explored[i]) {
      continue;
    }
    explored[i] = 1;
    expanded += 1;
    if (i === goal) {
      found = true;
      break;
    }

    const x = i % cols;
    const y = Math.floor(i / cols);
    for (let k = 0; k < NEIGHBOURS.length; k++) {
      const [dx, dy, step] = NEIGHBOURS[k];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        continue;
      }
      const j = ny * cols + nx;
      if (explored[j] || !passable(map, j)) {
        continue;
      }
      // No squeezing diagonally between two blocked cells
      if (dx && dy && (!passable(map, y * cols + nx) || !passable(map, ny * cols + x))) {
        continue;
      }

      const next = g[i] + step * (1 + cost[j] * COST_WEIGHT);
      if (next < g[j]) {
        g[j] = next;
        parent[j] = i;
        open.push(j, next + heuristic(j));
      }
    }
  }

  const stats = { explored, expanded, ms: performance.now() - startedAt };
  if (!found) {
    return stats;
  }

  const cells = [];
  for (let i = goal; i !== -1; i = parent[i]) {
    cells.push(i);
  }
  cells.reverse();

  const end = goalBlocked ? centreOf(map, goal) : { x: to.x, y: to.y };
  const corners = straighten(map, cells);
  // The start cell is where the robot already is, unless it has to step out of an obstacle
  const path = (startBlocked ? corners : corners.slice(1)).map(i => centreOf(map, i));
  if (path.length) {
    path[path.length - 1] = end;
  } else {
    path.push(end);
  }

  return { ...stats, cells, path, goal: end };
};

export { CELL, LETHAL, INSCRIBED_COST, buildCostmap, isFree, planPath };
