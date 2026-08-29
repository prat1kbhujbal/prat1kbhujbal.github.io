import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import PropTypes from 'prop-types';
import anime from 'animejs';
import styled from 'styled-components';
import { IconLoader } from '@components/icons';

const StyledLoader = styled.div`
  ${({ theme }) => theme.mixins.flexCenter};
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background-color: var(--dark-navy);
  z-index: 99;

  .boot {
    width: max-content;
    max-width: 90vw;
    margin-bottom: 30px;
    color: var(--slate);
    font-family: var(--font-mono);
    font-size: var(--fz-xs);
    text-align: left;

    @media (max-width: 480px) {
      font-size: var(--fz-xxs);
    }
  }

  .boot-line {
    margin: 0 0 8px;
    opacity: 0;
    white-space: nowrap;

    &:before {
      content: '>';
      margin-right: 10px;
      color: var(--green);
    }
  }

  .dots {
    color: var(--lightest-navy);
  }

  .ok {
    color: var(--green);
  }

  .logo-wrapper {
    width: max-content;
    max-width: 100px;
    transition: var(--transition);
    opacity: ${props => (props.isMounted ? 1 : 0)};
    svg {
      display: block;
      width: 100%;
      height: 100%;
      margin: 0 auto;
      fill: none;
      user-select: none;
      #B {
        opacity: 0;
      }
    }
  }
`;

const bootLines = [
  ['initializing sensors', '........', 'ok'],
  ['loading map', '.............', 'ok'],
  ['path planner', '............', 'ready'],
];

const Loader = ({ finishLoading }) => {
  const [isMounted, setIsMounted] = useState(false);

  const animate = () => {
    const loader = anime.timeline({
      complete: () => finishLoading(),
    });

    loader
      // Boot log prints a line at a time, like the robot is waking up
      .add({
        targets: '.boot-line',
        delay: anime.stagger(130, { start: 150 }),
        duration: 180,
        easing: 'easeOutQuad',
        opacity: [0, 1],
        translateY: [4, 0],
      })
      .add({
        targets: '#logo path',
        duration: 600,
        easing: 'easeInOutQuart',
        strokeDashoffset: [anime.setDashoffset, 0],
      })
      .add({
        targets: '#logo #P',
        duration: 400,
        easing: 'easeInOutQuart',
        opacity: 1,
      })
      .add({
        targets: '.boot',
        duration: 200,
        easing: 'easeInOutQuart',
        opacity: 0,
      })
      .add({
        targets: '#logo',
        delay: 100,
        duration: 250,
        easing: 'easeInOutQuart',
        opacity: 0,
        scale: 0.1,
      })
      .add({
        targets: '.loader',
        duration: 200,
        easing: 'easeInOutQuart',
        opacity: 0,
        zIndex: -1,
      });
  };

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 10);
    animate();
    return () => clearTimeout(timeout);
  }, []);

  return (
    <StyledLoader className="loader" isMounted={isMounted}>
      <Helmet bodyAttributes={{ class: `hidden` }} />

      <div className="boot">
        {bootLines.map(([label, dots, status]) => (
          <p className="boot-line" key={label}>
            {label} <span className="dots">{dots}</span> <span className="ok">{status}</span>
          </p>
        ))}
      </div>

      <div className="logo-wrapper">
        <IconLoader />
      </div>
    </StyledLoader>
  );
};

Loader.propTypes = {
  finishLoading: PropTypes.func.isRequired,
};

export default Loader;
