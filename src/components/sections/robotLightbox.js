import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { GatsbyImage } from 'gatsby-plugin-image';
import styled from 'styled-components';

const StyledLightbox = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000; /* above the cursor robot */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 80px;
  background-color: rgba(2, 12, 27, 0.92);
  backdrop-filter: blur(6px);

  @media (max-width: 768px) {
    padding: 60px 16px;
  }

  .stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 1100px;
    max-height: 100%;
  }

  .frame {
    max-height: calc(100vh - 190px);
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: 0 20px 50px -20px var(--navy-shadow);
  }

  .gatsby-image-wrapper,
  video {
    max-height: calc(100vh - 190px);
    width: auto;
    max-width: min(1100px, calc(100vw - 160px));
  }

  video {
    display: block;
  }

  .meta {
    margin-top: 20px;
    color: var(--light-slate);
    font-family: var(--font-mono);
    font-size: var(--fz-sm);
    text-align: center;
  }

  .counter {
    color: var(--green);
    margin-right: 12px;
  }

  button {
    ${({ theme }) => theme.mixins.flexCenter};
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--lightest-slate);
    cursor: pointer;
    transition: var(--transition);

    &:hover,
    &:focus-visible {
      color: var(--green);
    }
  }

  .close,
  .step {
    position: absolute;
    width: 44px;
    height: 44px;
    border: 1px solid var(--lightest-navy);
    border-radius: 50%;
    background-color: var(--light-navy);
  }

  .close {
    top: 20px;
    right: 20px;
    font-size: 20px;
    line-height: 1;
  }

  .step {
    top: 50%;
    transform: translateY(-50%);
    font-size: 22px;
  }

  .prev {
    left: 16px;
  }

  .next {
    right: 16px;
  }

  .hint {
    position: absolute;
    bottom: 18px;
    left: 0;
    right: 0;
    color: var(--slate);
    font-family: var(--font-mono);
    font-size: var(--fz-xxs);
    text-align: center;
  }
`;

/** Full-size viewer for the robots gallery, driven by the arrow keys. */
const RobotLightbox = ({ items, index, onClose, onStep }) => {
  const dialogRef = useRef(null);
  const item = items[index];

  // Hold the page still behind the viewer. Locking body overflow nudges the
  // scroll position by a few px, so put it back exactly on the way out.
  useEffect(() => {
    const { scrollY } = window;

    document.body.classList.add('hidden');

    if (dialogRef.current) {
      dialogRef.current.focus();
    }

    return () => {
      document.body.classList.remove('hidden');
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        onStep(1);
      } else if (e.key === 'ArrowLeft') {
        onStep(-1);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, onStep]);

  if (!item || typeof document === 'undefined') {
    return null;
  }

  // Rendered into <body>: ScrollReveal leaves a transform on the section,
  // which would otherwise become the containing block for position: fixed
  // and trap the overlay inside the section's box.
  return createPortal(
    <StyledLightbox
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Robot ${index + 1} of ${items.length}`}
      tabIndex={-1}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <button className="close" type="button" onClick={onClose} aria-label="Close">
        &times;
      </button>

      <button
        className="step prev"
        type="button"
        onClick={() => onStep(-1)}
        aria-label="Previous robot">
        &#8592;
      </button>

      <div className="stage">
        <div className="frame">
          {item.clip ? (
            <video autoPlay muted loop playsInline controls>
              <source src={item.clip} type="video/mp4" />
            </video>
          ) : (
            <GatsbyImage image={item.full} alt={item.caption || `Robot ${index + 1}`} />
          )}
        </div>
      </div>

      <button className="step next" type="button" onClick={() => onStep(1)} aria-label="Next robot">
        &#8594;
      </button>

      <p className="meta">
        <span className="counter">
          {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </span>
        {item.caption}
      </p>

      <p className="hint">← → to move · esc to close</p>
    </StyledLightbox>,
    document.body,
  );
};

RobotLightbox.propTypes = {
  items: PropTypes.array.isRequired,
  index: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired,
  onStep: PropTypes.func.isRequired,
};

export default RobotLightbox;
