const MAX_WAYPOINTS = 6;

/**
 * Lays out a gently curved route of waypoints from `from` to `to`, so a robot
 * walking it takes a considered path rather than a dead-straight line.
 * `bend` (1 or -1) picks which side the arc leans towards.
 */
const planRoute = (from, to, bend) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const legs = Math.max(Math.min(Math.round(dist / 90), MAX_WAYPOINTS), 2);

  // Control point pushed off to one side turns the straight line into an arc
  const cx = from.x + dx / 2 - dy * 0.16 * bend;
  const cy = from.y + dy / 2 + dx * 0.16 * bend;

  const route = [];
  for (let i = 1; i <= legs; i++) {
    const t = i / legs;
    const inv = 1 - t;
    route.push({
      x: inv * inv * from.x + 2 * inv * t * cx + t * t * to.x,
      y: inv * inv * from.y + 2 * inv * t * cy + t * t * to.y,
    });
  }

  return route;
};

export { MAX_WAYPOINTS };
export default planRoute;
