import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';
import planRoute, { MAX_WAYPOINTS } from '@utils/planRoute';
import RobotFigure from './robotFigure';

const StyledPatrol = styled.div`
  position: relative;
  width: 100%;
  max-width: 520px;
  height: 170px;
  margin: 20px auto 0;
  pointer-events: none;

  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 24px;
    border-bottom: 1px dashed var(--lightest-navy);
  }

  .route-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .route {
    fill: none;
    stroke: var(--green);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-dasharray: 1 7;
    opacity: 0.5;
    animation: lost-march 0.6s linear infinite;
  }

  .waypoint {
    fill: none;
    stroke: var(--green);
    stroke-width: 1.2;
    opacity: 0.35;
  }

  @keyframes lost-march {
    to {
      stroke-dashoffset: -8;
    }
  }

  .robot {
    position: absolute;
    top: 0;
    left: 0;
    width: 56px;
    height: 56px;
    margin: -28px 0 0 -28px;
    will-change: transform;
  }

  svg {
    overflow: visible;
    filter: drop-shadow(0 0 6px rgba(100, 255, 218, 0.35));
  }

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

  .scan-bar {
    opacity: 0;
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

const MAX_SWING = 34;
const MAX_LEAN = 16;
const ARRIVE_RADIUS = 10;
const MAX_SPEED = 3.4;
const STEER_EASE = 0.12;
const PAUSE_MS = 900; // beat spent looking around before it sets off again

/**
 * A robot with nowhere to be: it picks a spot, plans a route, walks it, has a
 * look around, then picks somewhere else. Used on the 404 page.
 */
const LostRobot = () => {
  const boxRef = useRef(null);
  const robotRef = useRef(null);
  const routeRef = useRef(null);
  const waypointsRef = useRef([]);
  const bodyRef = useRef(null);
  const pupilsRef = useRef(null);
  const legLeftRef = useRef(null);
  const legRightRef = useRef(null);
  const armLeftRef = useRef(null);
  const armRightRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted || prefersReducedMotion) {
      return;
    }

    const box = boxRef.current;
    const robot = robotRef.current;
    const route = routeRef.current;
    const dots = waypointsRef.current;
    const body = bodyRef.current;
    const pupils = pupilsRef.current;
    const legLeft = legLeftRef.current;
    const legRight = legRightRef.current;
    const armLeft = armLeftRef.current;
    const armRight = armRightRef.current;

    const bounds = () => ({ w: box.clientWidth, h: box.clientHeight });
    const { w, h } = bounds();

    // Its feet sit ~24px below its centre, so aim for the dashed ground line
    const pos = { x: w * 0.5, y: h - 48 };
    const vel = { x: 0, y: 0 };
    let waypoints = [];
    let leg = 0;
    let bend = 1;
    let pausedUntil = 0;
    let lean = 0;
    let stride = 0;
    let swing = 0;
    let facing = 1;
    let gaze = 0; // where it is looking while it stands and thinks
    let rafId = null;

    // Somewhere else along the ground, far enough away to be worth walking to
    const pickSpot = () => {
      const size = bounds();
      for (let i = 0; i < 12; i++) {
        const spot = {
          x: 40 + Math.random() * Math.max(size.w - 80, 40),
          y: size.h - 52 + Math.random() * 8,
        };
        if (Math.hypot(spot.x - pos.x, spot.y - pos.y) > size.w * 0.28) {
          return spot;
        }
      }
      return { x: size.w - pos.x, y: pos.y };
    };

    const setOff = () => {
      bend = -bend;
      waypoints = planRoute(pos, pickSpot(), bend);
      leg = 0;
      route.style.opacity = '';
    };

    setOff();

    const tick = () => {
      const now = Date.now();
      const walking = leg < waypoints.length && now > pausedUntil;

      if (walking) {
        const aim = waypoints[leg];
        const legDist = Math.hypot(aim.x - pos.x, aim.y - pos.y);

        if (legDist < ARRIVE_RADIUS) {
          leg += 1;
          if (leg >= waypoints.length) {
            // Arrived nowhere in particular — stop and think about it
            pausedUntil = now + PAUSE_MS + Math.random() * 900;
            route.setAttribute('d', '');
            dots.forEach(dot => dot && (dot.style.display = 'none'));
          }
        } else {
          const speed = Math.min(legDist * 0.14, MAX_SPEED);
          vel.x += (((aim.x - pos.x) / legDist) * speed - vel.x) * STEER_EASE;
          vel.y += (((aim.y - pos.y) / legDist) * speed - vel.y) * STEER_EASE;
        }
      } else {
        vel.x *= 0.85;
        vel.y *= 0.85;

        if (leg >= waypoints.length && now > pausedUntil) {
          setOff();
        }
      }

      pos.x += vel.x;
      pos.y += vel.y;

      // Draw whatever is left of the route
      if (walking && leg < waypoints.length) {
        const ahead = waypoints.slice(leg);
        const legs = ahead.map(p => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
        route.setAttribute('d', `M${pos.x.toFixed(1)} ${pos.y.toFixed(1)}${legs}`);

        dots.forEach((dot, i) => {
          if (!dot) {
            return;
          }
          const point = ahead[i];
          if (point) {
            dot.setAttribute('cx', point.x.toFixed(1));
            dot.setAttribute('cy', point.y.toFixed(1));
            dot.style.display = '';
          } else {
            dot.style.display = 'none';
          }
        });
      }

      const speed = Math.hypot(vel.x, vel.y);

      if (Math.abs(vel.x) > 0.25) {
        facing = vel.x > 0 ? 1 : -1;
      }

      const targetSwing = Math.min(speed * 11, MAX_SWING);
      swing += (targetSwing - swing) * 0.15;
      stride += 0.1 + Math.min(speed * 0.6, 14) * 0.16;

      const legSwing = Math.sin(stride) * swing;
      const armSwing = -legSwing * 0.75;

      const targetLean = Math.max(Math.min(vel.x * 4, MAX_LEAN), -MAX_LEAN);
      lean += (targetLean - lean) * 0.1;
      const bounce = -Math.abs(Math.sin(stride)) * swing * 0.06;
      const breathe = Math.sin(now / 420) * Math.max(1.6 - swing * 0.1, 0);

      robot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      body.style.transform = `translateY(${
        bounce + breathe
      }px) rotate(${lean}deg) scaleX(${facing})`;
      legLeft.style.transform = `rotate(${legSwing}deg)`;
      legRight.style.transform = `rotate(${-legSwing}deg)`;
      armLeft.style.transform = `rotate(${armSwing}deg)`;
      armRight.style.transform = `rotate(${-armSwing}deg)`;

      // Looks where it is going, and glances about while it is stopped
      gaze = walking ? gaze * 0.9 + 1.8 * 0.1 : Math.sin(now / 700) * 1.8;
      pupils.style.transform = `translate(${gaze}px, 0)`;

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(rafId);
  }, [isMounted, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <StyledPatrol ref={boxRef} aria-hidden="true">
      <div className="ground" />

      {isMounted && (
        <>
          <svg className="route-layer">
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
          </svg>

          <div className="robot" ref={robotRef}>
            <RobotFigure
              id="lost-robot"
              parts={{
                body: bodyRef,
                pupils: pupilsRef,
                legLeft: legLeftRef,
                legRight: legRightRef,
                armLeft: armLeftRef,
                armRight: armRightRef,
              }}
            />
          </div>
        </>
      )}
    </StyledPatrol>
  );
};

export default LostRobot;
