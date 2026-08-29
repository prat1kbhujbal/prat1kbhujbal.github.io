import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';

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
const FOLLOW_EASE = 0.09; // how fast the robot catches up to the cursor
const STANDOFF = 38; // px it keeps away so it never covers the pointer
const MAX_LEAN = 20; // deg it leans into the direction it is running
const MAX_SWING = 38; // deg the legs swing at a full sprint
const PUPIL_RANGE = 1.8; // px the pupils can shift inside the eyes

const CursorRobot = () => {
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

    const wrapper = wrapperRef.current;
    const body = bodyRef.current;
    const pupils = pupilsRef.current;
    const legLeft = legLeftRef.current;
    const legRight = legRightRef.current;
    const armLeft = armLeftRef.current;
    const armRight = armRightRef.current;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { x: target.x, y: target.y };
    let lean = 0; // current forward lean, in degrees
    let stride = 0; // where we are in the run cycle
    let swing = 0; // how wide the legs are swinging right now
    let facing = 1; // 1 = running right, -1 = running left
    let hasMoved = false;
    let rafId = null;

    const onMouseMove = e => {
      target.x = e.clientX;
      target.y = e.clientY;

      if (!hasMoved) {
        hasMoved = true;
        // Start from just off the cursor so it doesn't run in from the middle
        pos.x = target.x - STANDOFF;
        pos.y = target.y - STANDOFF;
        wrapper.classList.add('is-visible');
      }
    };

    const onMouseLeave = () => wrapper.classList.remove('is-visible');
    const onMouseEnter = () => hasMoved && wrapper.classList.add('is-visible');

    const tick = () => {
      // Run towards a point STANDOFF px short of the cursor, so the robot
      // pulls up beside the pointer instead of standing on top of it
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(dist - STANDOFF, 0);
      const goalX = pos.x + (dx / dist) * reach;
      const goalY = pos.y + (dy / dist) * reach;

      const vx = (goalX - pos.x) * FOLLOW_EASE;
      const vy = (goalY - pos.y) * FOLLOW_EASE;
      pos.x += vx;
      pos.y += vy;

      const speed = Math.hypot(vx, vy);

      // Turn to face the way it is running, once it is clearly moving
      if (Math.abs(vx) > 0.4) {
        facing = vx > 0 ? 1 : -1;
      }

      // The legs pump faster and wider the harder it is chasing, and settle
      // back to a stand when it catches up
      const targetSwing = Math.min(speed * 5, MAX_SWING);
      swing += (targetSwing - swing) * 0.15;
      stride += 0.1 + Math.min(speed, 14) * 0.16;

      const legSwing = Math.sin(stride) * swing;
      const armSwing = -legSwing * 0.75;

      // Lean into the run, and bounce once per step
      const targetLean = Math.max(Math.min(vx * 2.4, MAX_LEAN), -MAX_LEAN);
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
    <StyledRobot ref={wrapperRef} aria-hidden="true">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <g ref={bodyRef} className="robot-body">
          {/* legs — swing from the hips */}
          <g ref={legLeftRef} className="limb" style={{ transformOrigin: '24px 43px' }}>
            <path d="M24 43 L24 50" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
            <path
              d="M24 50 L20 51.5"
              stroke="var(--green)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
          <g ref={legRightRef} className="limb" style={{ transformOrigin: '32px 43px' }}>
            <path d="M32 43 L32 50" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
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
            <path d="M19 34 L14 39" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" />
          </g>
          <g ref={armRightRef} className="limb" style={{ transformOrigin: '37px 34px' }}>
            <path d="M37 34 L42 39" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </StyledRobot>
  );
};

export default CursorRobot;
