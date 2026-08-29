import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';
import planRoute, { MAX_WAYPOINTS } from '@utils/planRoute';
import RobotFigure from './robotFigure';

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

  /* Eyes squint shut from the middle when it dozes off */
  .pupils {
    transform-box: view-box;
    transform-origin: 28px 20px;
  }

  /* A bar sweeps the visor while it looks something over */
  .scan-bar {
    transform-box: view-box;
    opacity: 0;
    transition: opacity 0.2s var(--easing);
  }

  &.is-scanning .scan-bar {
    opacity: 0.85;
    animation: visor-scan 1.2s ease-in-out infinite;
  }

  /* A slower sweep while it stands there taking something in */
  &.is-observing .scan-bar {
    opacity: 0.6;
    animation: visor-scan 2.6s ease-in-out infinite;
  }

  &.is-asleep .bulb {
    animation: none;
    opacity: 0.2;
  }

  @keyframes visor-scan {
    0%,
    100% {
      transform: translateX(-8px);
    }
    50% {
      transform: translateX(8px);
    }
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

// Reaction tuning
const SETTLED_SPEED = 1.4; // px per frame below which it counts as standing still
const DOZE_AFTER = 7000; // ms of a motionless cursor before it powers down
const DOZE_EASE = 0.05; // how slowly it nods off and wakes back up

// Escort tuning — when a nav link is clicked the robot leads the way
const ESCORT_SPEED = 22; // px per frame, faster than its cursor chase
const ESCORT_MARGIN = 44; // how far inside the viewport edges it will run
const ESCORT_ARRIVED = 26; // px from the heading that counts as arrived
const ESCORT_HOLD = 1500; // ms it stands on the heading before letting go
const JAB_RATE = 2.4; // jabs per second — "this, this, this"
const ESCORT_TIMEOUT = 6000; // give up if the page never settles

// Planner tuning
const PLAN_MIN_DIST = 90; // shorter hops aren't worth planning, it just walks over
const REPLAN_DIST = 70; // how far the goal must drift before the route is redrawn
const ARRIVE_RADIUS = 14; // px within which a waypoint counts as reached
const MAX_SPEED = 13; // px per frame
const STEER_EASE = 0.16; // how sharply it turns onto the next leg
const TRACK_EASE = 0.09; // easing used for small corrections once it has arrived

// Things worth stopping and having a proper look at
const WORTH_A_LOOK = '.project-inner, .project-image, .project-content, #about .wrapper';

/** What the robot makes of whatever the cursor is sitting on. */
const readTarget = el => {
  if (!el || !el.closest) {
    return { mode: 'none' };
  }

  const subject = el.closest(WORTH_A_LOOK);
  if (subject) {
    return { mode: 'observe', subject };
  }

  if (el.closest('img, picture, .gatsby-image-wrapper, svg[data-gatsby-image-wrapper]')) {
    return { mode: 'scan' };
  }

  if (el.closest('a, button, [role="button"]')) {
    return { mode: 'point' };
  }

  return { mode: 'none' };
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
    let hovering = 'none'; // what the cursor is resting on
    let watching = null; // the element it has stopped to study
    let chin = 0; // 0 arms down, 1 hands under the chin
    let lastMoveAt = Date.now();
    let doze = 0; // 0 awake, 1 fast asleep
    let pointRot = 0; // where the pointing arm is currently held
    let hasMoved = false;
    let escortEl = null; // heading it is currently leading the way to
    let escortStarted = 0;
    let escortArrivedAt = 0;
    let escortLastTop = null;
    let escortAim = null; // the heading itself, which it jabs a finger at
    let jabExtend = 1;
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
      lastMoveAt = Date.now();
      const read = readTarget(e.target);
      hovering = read.mode;
      watching = read.subject || null;

      if (!hasMoved) {
        hasMoved = true;
        pos.x = target.x - STANDOFF;
        pos.y = target.y - STANDOFF;
        wrapper.classList.add('is-visible');
      }
    };

    // Any link pointing at a section on this page turns into an escort:
    // the robot breaks off and runs ahead to the heading you asked for
    const onClick = e => {
      if (!e.target.closest) {
        return;
      }

      const link = e.target.closest('a[href*="#"]');
      if (!link) {
        return;
      }

      const url = new URL(link.href, window.location.href);
      if (url.pathname !== window.location.pathname) {
        return;
      }

      const section = url.hash.length > 1 && document.getElementById(url.hash.slice(1));
      if (!section) {
        return;
      }

      // Sections are page-tall; lead the way to their heading instead
      escortEl = section.querySelector('h1, h2, h3') || section;
      escortStarted = Date.now();
      escortArrivedAt = 0;
      escortLastTop = null;
      clearRoute();
      wrapper.classList.add('is-visible');
      plan.style.opacity = '1';
    };

    const onMouseLeave = () => {
      wrapper.classList.remove('is-visible');
      clearRoute();
    };
    const onMouseEnter = () => hasMoved && wrapper.classList.add('is-visible');

    const tick = () => {
      const now = Date.now();

      // While escorting, the goal is the heading itself — kept inside the
      // viewport so the robot runs ahead of the scroll rather than off-screen
      let escortGoal = null;
      if (escortEl) {
        const box = escortEl.getBoundingClientRect();
        // It stands just to the side of the heading and points at the text
        escortAim = { x: box.left + 24, y: box.top + box.height / 2 };
        escortGoal = {
          x: Math.min(Math.max(box.left - 34, ESCORT_MARGIN), window.innerWidth - ESCORT_MARGIN),
          y: Math.min(
            Math.max(box.top + box.height / 2, ESCORT_MARGIN),
            window.innerHeight - ESCORT_MARGIN,
          ),
        };

        const gap = Math.hypot(escortGoal.x - pos.x, escortGoal.y - pos.y);
        // The scroll has finished once the heading stops moving under us
        const settled = escortLastTop !== null && Math.abs(box.top - escortLastTop) < 0.5;
        escortLastTop = box.top;

        if (gap < ESCORT_ARRIVED && settled && !escortArrivedAt) {
          escortArrivedAt = now; // planted on the heading, hold a beat
        }

        if (
          (escortArrivedAt && now - escortArrivedAt > ESCORT_HOLD) ||
          now - escortStarted > ESCORT_TIMEOUT
        ) {
          escortEl = null;
          escortArrivedAt = 0;
          escortAim = null;
          plan.style.opacity = '0';
        }
      }

      // The goal is a point STANDOFF px short of the cursor, so the robot
      // pulls up beside the pointer instead of standing on top of it
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(dist - STANDOFF, 0);
      const goal = escortGoal || { x: pos.x + (dx / dist) * reach, y: pos.y + (dy / dist) * reach };

      // Plan a fresh route whenever the goal has moved somewhere new
      const goalDrift = planGoal ? Math.hypot(goal.x - planGoal.x, goal.y - planGoal.y) : Infinity;
      if (!escortEl && reach > PLAN_MIN_DIST && goalDrift > REPLAN_DIST) {
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

      if (escortEl) {
        // Sprint for the heading, easing off as it gets there
        const legDist = Math.hypot(goal.x - pos.x, goal.y - pos.y) || 1;
        const speed = Math.min(legDist * 0.22, ESCORT_SPEED);
        vel.x += (((goal.x - pos.x) / legDist) * speed - vel.x) * 0.2;
        vel.y += (((goal.y - pos.y) / legDist) * speed - vel.y) * 0.2;
      } else if (leg < waypoints.length) {
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
      if (escortEl) {
        route.setAttribute(
          'd',
          `M${pos.x.toFixed(1)} ${pos.y.toFixed(1)}L${goal.x.toFixed(1)} ${goal.y.toFixed(1)}`,
        );
        dots.forEach(dot => dot && (dot.style.display = 'none'));
        goalMarker.setAttribute(
          'transform',
          `translate(${goal.x.toFixed(1)} ${goal.y.toFixed(1)})`,
        );
      } else if (leg < waypoints.length) {
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

      // Once it has caught up it can take an interest in whatever is under
      // the cursor — and nod off if the cursor stops moving altogether
      const settled = speed < SETTLED_SPEED && !escortEl;
      const wantsDoze = !escortEl && now - lastMoveAt > DOZE_AFTER && settled;
      doze += ((wantsDoze ? 1 : 0) - doze) * DOZE_EASE;

      const awake = doze < 0.3;
      const observing = settled && awake && hovering === 'observe' && !!watching;
      const scanning = settled && awake && hovering === 'scan';
      const pointing = settled && awake && hovering === 'point';

      wrapper.classList.toggle('is-observing', observing);
      wrapper.classList.toggle('is-scanning', scanning);
      wrapper.classList.toggle('is-asleep', doze > 0.5);

      // Settling into (or out of) the hands-under-the-chin pose
      chin += ((observing ? 1 : 0) - chin) * 0.12;

      // Arrived at the heading it was asked for: jab a finger at it a few
      // times — this one, this one — rather than just staring
      const jabbing = !!(escortArrivedAt && escortAim);

      if (jabbing) {
        facing = escortAim.x > pos.x ? 1 : -1;
        const shoulderX = pos.x + 9 * facing;
        const shoulderY = pos.y + 6;
        const aim =
          (Math.atan2(escortAim.y - shoulderY, (escortAim.x - shoulderX) * facing) * 180) / Math.PI;
        pointRot += (Math.max(Math.min(aim - 45, 80), -170) - pointRot) * 0.35;

        // Only the positive half of the wave, so it pokes out and pulls back
        const beat = Math.max(
          Math.sin(((now - escortArrivedAt) / 1000) * Math.PI * 2 * JAB_RATE),
          0,
        );
        jabExtend = 1.15 + beat * 0.5;
      } else if (pointing) {
        // Turn towards the link and raise the near arm at it
        facing = target.x > pos.x ? 1 : -1;
        const shoulderX = pos.x + 9 * facing;
        const shoulderY = pos.y + 6;
        const aim =
          (Math.atan2(target.y - shoulderY, (target.x - shoulderX) * facing) * 180) / Math.PI;
        pointRot += (Math.max(Math.min(aim - 45, 80), -170) - pointRot) * 0.2;
        jabExtend = 1.45;
      }

      // What the eyes should follow: the thing being studied, else the cursor
      const look =
        escortAim || (escortEl ? { x: goal.x, y: goal.y } : { x: target.x, y: target.y });
      if (observing) {
        const box = watching.getBoundingClientRect();
        look.x = box.x + box.width / 2;
        look.y = box.y + box.height / 2;
        // Face it, and tip the head over as if considering the thing
        facing = look.x > pos.x ? 1 : -1;
      }

      const tilt = lean + chin * 7;

      wrapper.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      body.style.transform = `translateY(${
        bounce + breathe + doze * 5
      }px) rotate(${tilt}deg) scaleX(${facing})`;

      legLeft.style.transform = `rotate(${legSwing}deg)`;
      legRight.style.transform = `rotate(${-legSwing}deg)`;

      // Both hands come up under the chin while it studies something —
      // swung right over so they rest against the face, not in the seam
      // between head and body where they would be lost against the outline
      const chinScale = 1 + chin * 0.06;
      armLeft.style.transform = `rotate(${
        armSwing * (1 - chin) - 171 * chin
      }deg) scale(${chinScale})`;
      // The pointing arm reaches out, so it reads as a point and not a shrug
      armRight.style.transform =
        pointing || jabbing
          ? `rotate(${pointRot}deg) scale(${jabExtend})`
          : `rotate(${-armSwing * (1 - chin) + 171 * chin}deg) scale(${chinScale})`;

      // Eyes hold on whatever it is watching, and squeeze shut as it dozes off
      const eyeAngle = Math.atan2(look.y - pos.y, look.x - pos.x);
      pupils.style.transform = `translate(${Math.cos(eyeAngle) * PUPIL_RANGE * facing}px, ${
        Math.sin(eyeAngle) * PUPIL_RANGE
      }px) scaleY(${1 - doze * 0.85})`;

      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.documentElement.addEventListener('mouseleave', onMouseLeave);
    document.documentElement.addEventListener('mouseenter', onMouseEnter);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click', onClick);
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
        <RobotFigure
          id="cursor-robot"
          parts={{
            body: bodyRef,
            pupils: pupilsRef,
            legLeft: legLeftRef,
            legRight: legRightRef,
            armLeft: armLeftRef,
            armRight: armRightRef,
          }}
        />
      </StyledRobot>
    </>
  );
};

export default CursorRobot;
