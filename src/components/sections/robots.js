import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { graphql, useStaticQuery } from 'gatsby';
import { GatsbyImage, getImage } from 'gatsby-plugin-image';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';
import RobotLightbox from './robotLightbox';

const StyledContactSection = styled.section`
  margin: 0 auto 100px;
  text-align: center;

  @media (max-width: 768px) {
    margin: 0 auto 50px;
  }

  .overline {
    display: block;
    margin-bottom: 20px;
    color: var(--green);
    font-family: var(--font-mono);
    font-size: var(--fz-md);
    font-weight: 400;

    &:before {
      bottom: 0;
      font-size: var(--fz-sm);
    }

    &:after {
      display: none;
    }
  }

  .title {
    font-size: clamp(40px, 5vw, 60px);
  }

  .robot-images {
    column-count: 3;
    column-gap: 20px;

    @media (max-width: 768px) {
      column-count: 2;
    }

    @media (max-width: 480px) {
      column-count: 1;
    }
  }

  /* Each tile opens the viewer, so it is a button rather than a bare image */
  .tile {
    position: relative;
    display: inline-block;
    width: 100%;
    margin-bottom: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius);
    background-color: var(--light-navy);
    overflow: hidden;
    break-inside: avoid;
    vertical-align: middle;
    cursor: pointer;
    transition: var(--transition);

    &:hover,
    &:focus-visible {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px -12px var(--navy-shadow);

      .veil {
        opacity: 1;
      }
    }

    video {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      object-fit: cover;
    }
  }

  /* Green wash with a magnifier hint, on hover only */
  .veil {
    ${({ theme }) => theme.mixins.flexCenter};
    position: absolute;
    inset: 0;
    opacity: 0;
    background-color: var(--green-tint);
    color: var(--green);
    font-family: var(--font-mono);
    font-size: var(--fz-xs);
    transition: var(--transition);
  }
`;

// The gallery in its original order. The two entries that are clips were
// GIFs weighing 42MB between them; they are H.264 now.
const GALLERY = ['1', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '2'];

// Captions shown in the viewer, keyed by file name. Anything left blank
// simply shows nothing — fill in the ones you want named.
const CAPTIONS = {
  1: '',
  2: '',
  3: '',
  4: '',
  5: '',
  6: '',
  7: '',
  8: '',
  9: '',
  10: '',
  11: '',
  12: '',
  13: '',
  14: '',
};

/**
 * A clip that fetches nothing until it is nearly on screen — autoplaying
 * video otherwise downloads on page load, wherever it sits on the page.
 */
const LazyClip = ({ src, label }) => {
  const videoRef = useRef(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const el = videoRef.current;

    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isNear && videoRef.current) {
      videoRef.current.load();
    }
  }, [isNear]);

  return (
    <video ref={videoRef} autoPlay muted loop playsInline preload="none" aria-label={label}>
      {isNear && <source src={src} type="video/mp4" />}
    </video>
  );
};

LazyClip.propTypes = {
  src: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

const shuffleArray = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const Robots = () => {
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [order, setOrder] = useState(GALLERY);
  const [openIndex, setOpenIndex] = useState(null);
  const isOpenRef = useRef(false);
  const lastTileRef = useRef(null);

  const data = useStaticQuery(graphql`
    query {
      stills: allFile(
        filter: { relativeDirectory: { eq: "robots" }, extension: { in: ["jpg", "png"] } }
      ) {
        nodes {
          name
          childImageSharp {
            thumb: gatsbyImageData(width: 400, placeholder: BLURRED, formats: [AUTO, WEBP, AVIF])
            full: gatsbyImageData(width: 1400, placeholder: NONE, formats: [AUTO, WEBP, AVIF])
          }
        }
      }
      clips: allFile(filter: { relativeDirectory: { eq: "robots" }, extension: { eq: "mp4" } }) {
        nodes {
          name
          publicURL
        }
      }
    }
  `);

  const stills = Object.fromEntries(data.stills.nodes.map(node => [node.name, node]));
  const clips = Object.fromEntries(data.clips.nodes.map(node => [node.name, node]));

  const items = order.map(name => ({
    name,
    caption: CAPTIONS[name] || '',
    clip: clips[name] ? clips[name].publicURL : null,
    thumb: stills[name] ? getImage(stills[name].childImageSharp.thumb) : null,
    full: stills[name] ? getImage(stills[name].childImageSharp.full) : null,
  }));

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    sr.reveal(revealContainer.current, srConfig());

    const interval = setInterval(() => {
      // Never reshuffle under an open viewer, or next/previous jump about
      if (!isOpenRef.current) {
        setOrder(prevOrder => shuffleArray([...prevOrder]));
      }
    }, 20000); // 20 seconds

    return () => clearInterval(interval); // cleanup on unmount
  }, []);

  const open = index => {
    isOpenRef.current = true;
    setOpenIndex(index);
  };

  const close = () => {
    isOpenRef.current = false;
    setOpenIndex(null);

    if (lastTileRef.current) {
      // Hand focus back to the tile it came from, without yanking the page
      // to it — plain focus() scrolls the element into view
      lastTileRef.current.focus({ preventScroll: true });
    }
  };

  const step = delta => setOpenIndex(current => (current + delta + items.length) % items.length);

  return (
    <StyledContactSection id="robots" ref={revealContainer}>
      <h2 className="numbered-heading overline">Robots</h2>
      <h2 className="title">Robots I've developed or worked on</h2>

      <div className="robot-images">
        {items.map((item, index) => (
          <button
            key={item.name}
            className="tile"
            type="button"
            aria-label={`View robot ${index + 1} of ${items.length}`}
            onClick={e => {
              lastTileRef.current = e.currentTarget;
              open(index);
            }}>
            {item.clip ? (
              <LazyClip src={item.clip} label={`Robot ${index + 1}`} />
            ) : (
              item.thumb && <GatsbyImage image={item.thumb} alt={`Robot ${index + 1}`} />
            )}
            <span className="veil">view</span>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <RobotLightbox items={items} index={openIndex} onClose={close} onStep={step} />
      )}
    </StyledContactSection>
  );
};

export default Robots;
