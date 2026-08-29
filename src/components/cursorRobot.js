import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';

const StyledPlan = styled.svg`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9998;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.35s var(--easing);
  overflow: visible;

  .route {
    fill: none;
    stroke: var(--green);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-dasharray: 1 7;
    opacity: 0.55;
    animation: route-march 0.6s linear infinite;
  }

  .waypoint {
    fill: none;
    stroke: var(--green);
    stroke-width: 1.2;
    opacity: 0.4;
  }

  .goal-ring {
    fill: none;
    stroke: var(--green);
    stroke-width: 1.2;
    opacity: 0.5;
  }

  .goal-cross {
    stroke: var(--green);
    stroke-width: 1.2;
    opacity: 0.5;
  }

  @keyframes route-march {
    to {
      stroke-dashoffset: -8;
    }
  }

  @media (hover: none), (pointer: coarse) {
    display: none;
  }
`;

const StyledRobot = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px; /* centre the robot on its own coordinates */
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s var(--easing);
  will-change: transform;

  &.is-visible {
    opacity: 1;
  }

  /* No cursor to follow on touch screens */
  @media (hover: none), (pointer: coarse) {
    display: none;
  }

  svg {
    overflow: visible;
    filter: drop-shadow(0 0 6px rgba(100, 255, 218, 0.35));
  }

  /* Joints rotate about points given in the viewBox coordinate system */
  .robot-body,
  .limb {
    transform-box: view-box;
    will-change: transform;
  }

  .robot-body {
    transform-origin: 28px 30px;
  }

  .bulb {
    animation: robot-blink 2s ease-in-out infinite;
  }

  @keyframes robot-blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }
`;

// Motion tuning
const STANDOFF = 38; // px it keeps away so it never covers the pointer
const MAX_LEAN = 20; // deg it leans into the direction it is running
const MAX_SWING = 38; // deg the legs swing at a full sprint
const PUPIL_RANGE = 1.8; // px the pupils can shift inside the eyes

// Planner tuning
const MAX_WAYPOINTS = 6;
const PLAN_MIN_DIST = 90; // shorter hops aren't worth planning, it just walks over
const REPLAN_DIST = 70; // how far the goal must drift before the route is redrawn
const ARRIVE_RADIUS = 14; // px within which a waypoint counts as reached
const MAX_SPEED = 13; // px per frame
const STEER_EASE = 0.16; // how sharply it turns onto the next leg
const TRACK_EASE = 0.09; // easing used for small corrections once it has arrived

/**
 * Lays out a gently curved route of waypoints from `from` to `to`, so the
 * robot takes a considered path rather than a dead-straight line.
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

const CursorRobot = () => {
  const planRef = useRef(null);
  const routeRef = useRef(null);
  const waypointsRef = useRef([]);
  const goalRef = useRef(null);
  const wrapperRef = useRef(null);
  const bodyRef = useRef(null);
  const pupilsRef = useRef(null);
  const legLeftRef = useRef(null);
  const legRightRef = useRef(null);
  const armLeftRef = useRef(null);
  const armRightRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  // The server renders nothing, so the first client render has to match it —
  // otherwise the extra node throws off hydration of the whole layout
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted || prefersReducedMotion) {
      return;
    }

    // Skip devices without a real pointer
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) {
      return;
    }

    const plan = planRef.current;
    const route = routeRef.current;
    const dots = waypointsRef.current;
    const goalMarker = goalRef.current;
    const wrapper = wrapperRef.current;
    const body = bodyRef.current;
    const pupils = pupilsRef.current;
    const legLeft = legLeftRef.current;
    const legRight = legRightRef.current;
    const armLeft = armLeftRef.current;
    const armRight = armRightRef.current;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { x: target.x, y: target.y };
    const vel = { x: 0, y: 0 };
    let waypoints = []; // the route it is currently walking
    let leg = 0; // which waypoint it is heading for
    let planGoal = null; // where the current route was aimed
    let bend = 1; // which way the next route curves
    let lean = 0;
    let stride = 0;
    let swing = 0;
    let facing = 1;
    let hasMoved = false;
    let rafId = null;

    const clearRoute = () => {
      waypoints = [];
      leg = 0;
      planGoal = null;
      plan.style.opacity = '0';
    };

    const onMouseMove = e => {
      target.x = e.clientX;
      target.y = e.clientY;

      if (!hasMoved) {
        hasMoved = true;
        pos.x = target.x - STANDOFF;
        pos.y = target.y - STANDOFF;
        wrapper.classList.add('is-visible');
      }
    };

    const onMouseLeave = () => {
      wrapper.classList.remove('is-visible');
      clearRoute();
    };
    const onMouseEnter = () => hasMoved && wrapper.classList.add('is-visible');

    const tick = () => {
      // The goal is a point STANDOFF px short of the cursor, so the robot
      // pulls up beside the pointer instead of standing on top of it
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(dist - STANDOFF, 0);
      const goal = { x: pos.x + (dx / dist) * reach, y: pos.y + (dy / dist) * reach };

      // Plan a fresh route whenever the goal has moved somewhere new
      const goalDrift = planGoal ? Math.hypot(goal.x - planGoal.x, goal.y - planGoal.y) : Infinity;
      if (reach > PLAN_MIN_DIST && goalDrift > REPLAN_DIST) {
        // Only pick a new side to curve towards when setting off afresh —
        // mid-chase replans keep the same arc so the route doesn't flip about
        if (!planGoal) {
          bend = -bend;
        }
        waypoints = planRoute(pos, goal, bend);
        planGoal = { ...goal };
        leg = 0;
        plan.style.opacity = '1';
      }

      if (leg < waypoints.length) {
        // Walk the route: head for the next waypoint, tick it off on arrival
        const aim = waypoints[leg];
        const legDist = Math.hypot(aim.x - pos.x, aim.y - pos.y);

        if (legDist < ARRIVE_RADIUS) {
          leg += 1;
          if (leg >= waypoints.length) {
            clearRoute();
          }
        } else {
          const remaining = legDist + (waypoints.length - 1 - leg) * 90;
          const speed = Math.min(remaining * 0.12, MAX_SPEED);
          vel.x += (((aim.x - pos.x) / legDist) * speed - vel.x) * STEER_EASE;
          vel.y += (((aim.y - pos.y) / legDist) * speed - vel.y) * STEER_EASE;
        }
      } else {
        // No route left — just keep station next to the cursor
        vel.x = (goal.x - pos.x) * TRACK_EASE;
        vel.y = (goal.y - pos.y) * TRACK_EASE;
      }

      pos.x += vel.x;
      pos.y += vel.y;

      // Draw the part of the route it still has to walk
      if (leg < waypoints.length) {
        const ahead = waypoints.slice(leg);
        const legs = ahead.map(p => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
        route.setAttribute('d', `M${pos.x.toFixed(1)} ${pos.y.toFixed(1)}${legs}`);

        dots.forEach((dot, i) => {
          const point = ahead[i];
          if (point) {
            dot.setAttribute('cx', point.x.toFixed(1));
            dot.setAttribute('cy', point.y.toFixed(1));
            dot.style.display = '';
          } else {
            dot.style.display = 'none';
          }
        });

        goalMarker.setAttribute(
          'transform',
          `translate(${planGoal.x.toFixed(1)} ${planGoal.y.toFixed(1)})`,
        );
      }

      const speed = Math.hypot(vel.x, vel.y);

      if (Math.abs(vel.x) > 0.4) {
        facing = vel.x > 0 ? 1 : -1;
      }

      // The legs pump faster and wider the harder it is chasing, and settle
      // back to a stand when it catches up
      const targetSwing = Math.min(speed * 5, MAX_SWING);
      swing += (targetSwing - swing) * 0.15;
      stride += 0.1 + Math.min(speed, 14) * 0.16;

      const legSwing = Math.sin(stride) * swing;
      const armSwing = -legSwing * 0.75;

      const targetLean = Math.max(Math.min(vel.x * 2.4, MAX_LEAN), -MAX_LEAN);
      lean += (targetLean - lean) * 0.1;
      const bounce = -Math.abs(Math.sin(stride)) * swing * 0.06;
      const breathe = Math.sin(Date.now() / 420) * Math.max(1.6 - swing * 0.1, 0);

      wrapper.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      body.style.transform = `translateY(${
        bounce + breathe
      }px) rotate(${lean}deg) scaleX(${facing})`;

      legLeft.style.transform = `rotate(${legSwing}deg)`;
      legRight.style.transform = `rotate(${-legSwing}deg)`;
      armLeft.style.transform = `rotate(${armSwing}deg)`;
      armRight.style.transform = `rotate(${-armSwing}deg)`;

      // Eyes stay on the cursor even when the body is flipped
      const eyeAngle = Math.atan2(target.y - pos.y, target.x - pos.x);
      pupils.style.transform = `translate(${Math.cos(eyeAngle) * PUPIL_RANGE * facing}px, ${
        Math.sin(eyeAngle) * PUPIL_RANGE
      }px)`;

      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouseMove);
    document.documentElement.addEventListener('mouseleave', onMouseLeave);
    document.documentElement.addEventListener('mouseenter', onMouseEnter);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      document.documentElement.removeEventListener('mouseleave', onMouseLeave);
      document.documentElement.removeEventListener('mouseenter', onMouseEnter);
    };
  }, [isMounted, prefersReducedMotion]);

  if (!isMounted || prefersReducedMotion) {
    return null;
  }

  return (
    <>
      <StyledPlan ref={planRef} aria-hidden="true">
        <path ref={routeRef} className="route" d="" />
        {Array.from({ length: MAX_WAYPOINTS }).map((_, i) => (
          <circle
            key={i}
            className="waypoint"
            r="2"
            ref={el => {
              waypointsRef.current[i] = el;
            }}
          />
        ))}
        <g ref={goalRef}>
          <circle className="goal-ring" r="7" />
          <line className="goal-cross" x1="-10" y1="0" x2="-4" y2="0" />
          <line className="goal-cross" x1="4" y1="0" x2="10" y2="0" />
          <line className="goal-cross" x1="0" y1="-10" x2="0" y2="-4" />
          <line className="goal-cross" x1="0" y1="4" x2="0" y2="10" />
        </g>
      </StyledPlan>

      <StyledRobot ref={wrapperRef} aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <g ref={bodyRef} className="robot-body">
            {/* legs — swing from the hips */}
            <g ref={legLeftRef} className="limb" style={{ transformOrigin: '24px 43px' }}>
              <path
                d="M24 43 L24 50"
                stroke="var(--green)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M24 50 L20 51.5"
                stroke="var(--green)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>
            <g ref={legRightRef} className="limb" style={{ transformOrigin: '32px 43px' }}>
              <path
                d="M32 43 L32 50"
                stroke="var(--green)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M32 50 L36 51.5"
                stroke="var(--green)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>

            {/* antenna */}
            <line x1="28" y1="10" x2="28" y2="4" stroke="var(--green)" strokeWidth="1.6" />
            <circle className="bulb" cx="28" cy="3" r="2.4" fill="var(--green)" />

            {/* head */}
            <rect
              x="14"
              y="10"
              width="28"
              height="20"
              rx="8"
              fill="var(--light-navy)"
              stroke="var(--green)"
              strokeWidth="1.8"
            />

            {/* visor */}
            <rect x="18" y="15" width="20" height="10" rx="5" fill="var(--navy)" />

            {/* eyes */}
            <g ref={pupilsRef}>
              <circle cx="24" cy="20" r="2.6" fill="var(--green)" />
              <circle cx="32" cy="20" r="2.6" fill="var(--green)" />
            </g>

            {/* ears */}
            <rect x="10.5" y="17" width="3.5" height="7" rx="1.7" fill="var(--green)" />
            <rect x="42" y="17" width="3.5" height="7" rx="1.7" fill="var(--green)" />

            {/* body */}
            <rect
              x="19"
              y="31"
              width="18"
              height="12"
              rx="4"
              fill="var(--light-navy)"
              stroke="var(--green)"
              strokeWidth="1.8"
            />
            <circle cx="28" cy="37" r="2" fill="var(--green)" opacity="0.9" />

            {/* arms — swing from the shoulders, opposite the legs */}
            <g ref={armLeftRef} className="limb" style={{ transformOrigin: '19px 34px' }}>
              <path
                d="M19 34 L14 39"
                stroke="var(--green)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
            <g ref={armRightRef} className="limb" style={{ transformOrigin: '37px 34px' }}>
              <path
                d="M37 34 L42 39"
                stroke="var(--green)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
      </StyledRobot>
    </>
  );
};

export default CursorRobot;
