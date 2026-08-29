import React from 'react';
import PropTypes from 'prop-types';

/**
 * The robot itself. Every moving part is handed out as a ref so whoever
 * renders it can drive the walk cycle: `parts` takes body, pupils, legLeft,
 * legRight, armLeft and armRight.
 */
const RobotFigure = ({ id, parts }) => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
    <g ref={parts.body} className="robot-body">
      {/* legs — swing from the hips */}
      <g ref={parts.legLeft} className="limb" style={{ transformOrigin: '24px 43px' }}>
        <path d="M24 43 L24 50" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 50 L20 51.5" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g ref={parts.legRight} className="limb" style={{ transformOrigin: '32px 43px' }}>
        <path d="M32 43 L32 50" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M32 50 L36 51.5" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
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

      {/* visor, with a bar that sweeps it while studying something */}
      <defs>
        <clipPath id={`${id}-visor`}>
          <rect x="18" y="15" width="20" height="10" rx="5" />
        </clipPath>
      </defs>
      <rect x="18" y="15" width="20" height="10" rx="5" fill="var(--navy)" />
      <g clipPath={`url(#${id}-visor)`}>
        <rect className="scan-bar" x="26.5" y="15" width="3" height="10" fill="var(--green)" />
      </g>

      {/* eyes */}
      <g ref={parts.pupils} className="pupils">
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
      <g ref={parts.armLeft} className="limb" style={{ transformOrigin: '19px 34px' }}>
        <path d="M19 34 L14 39" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g ref={parts.armRight} className="limb" style={{ transformOrigin: '37px 34px' }}>
        <path d="M37 34 L42 39" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </g>
  </svg>
);

RobotFigure.propTypes = {
  id: PropTypes.string.isRequired,
  parts: PropTypes.object.isRequired,
};

export default RobotFigure;
