import { useEffect } from 'react';
import usePrefersReducedMotion from './usePrefersReducedMotion';

// Feel of the glide
const EASE = 0.085; // how much of the remaining distance is covered each frame
const WHEEL_STRENGTH = 1; // multiplier on the raw wheel delta
const SETTLE = 0.4; // px below which the animation is finished

// A wheel over something that scrolls on its own (the jobs tab strip, a code
// block) should scroll that, not the page
const canScrollItself = (el, delta) => {
  let node = el;

  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollHeight > node.clientHeight) {
      const { overflowY } = window.getComputedStyle(node);

      if (overflowY === 'auto' || overflowY === 'scroll') {
        const room =
          delta > 0 ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
        if (room > 1) {
          return true;
        }
      }
    }
    node = node.parentElement;
  }

  return false;
};

/**
 * Gives the wheel a bit of weight: instead of jumping straight to where the
 * browser would land, the page eases towards it and coasts to a stop.
 * Keyboard, scrollbar dragging, anchor links and touch keep working natively.
 */
function useSmoothScroll() {
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    let target = window.scrollY;
    let current = window.scrollY;
    let applied = window.scrollY;
    let rafId = null;

    const maxScroll = () => Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);

    const stop = () => {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    };

    const tick = () => {
      const distance = target - current;

      if (Math.abs(distance) < SETTLE) {
        current = target;
        applied = target;
        window.scrollTo({ top: target, behavior: 'instant' });
        stop();
        return;
      }

      current += distance * EASE;
      applied = current;
      window.scrollTo({ top: current, behavior: 'instant' });
      rafId = window.requestAnimationFrame(tick);
    };

    const onWheel = e => {
      // Let the menu overlay and pinch-zoom gestures behave normally
      if (e.ctrlKey || document.body.classList.contains('blur')) {
        return;
      }

      let delta = e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 16; // lines
      } else if (e.deltaMode === 2) {
        delta *= window.innerHeight; // pages
      }

      if (canScrollItself(e.target, delta)) {
        return;
      }

      e.preventDefault();

      if (!rafId) {
        // Nothing in flight, so start from wherever the page actually is
        current = window.scrollY;
      }

      target = Math.min(Math.max(target + delta * WHEEL_STRENGTH, 0), maxScroll());

      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    // Anything that scrolls the page some other way (keyboard, scrollbar,
    // anchor links, route changes) becomes the new starting point
    const onScroll = () => {
      if (Math.abs(window.scrollY - applied) > 2) {
        stop();
        target = window.scrollY;
        current = window.scrollY;
        applied = window.scrollY;
      }
    };

    const onResize = () => {
      target = Math.min(target, maxScroll());
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      stop();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [prefersReducedMotion]);
}

export default useSmoothScroll;
