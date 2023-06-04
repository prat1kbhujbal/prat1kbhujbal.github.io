import React, { useEffect, useRef, useState } from 'react';

import styled from 'styled-components';
import { srConfig, email } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';
import RobotImage1 from '../../images/robots/1.jpg';
import RobotImage2 from '../../images/robots/2.gif';
import RobotImage3 from '../../images/robots/3.jpg';
import RobotImage4 from '../../images/robots/4.jpg';
import RobotImage5 from '../../images/robots/5.jpg';
import RobotImage6 from '../../images/robots/6.jpg';
import RobotImage7 from '../../images/robots/7.jpg';
import RobotImage8 from '../../images/robots/8.jpg';
import RobotImage9 from '../../images/robots/9.png';
import RobotImage10 from '../../images/robots/10.jpg';
import RobotImage11 from '../../images/robots/11.jpg';
import RobotImage12 from '../../images/robots/12.gif';
import RobotImage13 from '../../images/robots/13.jpg';
import RobotImage14 from '../../images/robots/14.jpg';


const StyledContactSection = styled.section`
  max-width: 768pxpx;
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

  .email-link {
    ${({ theme }) => theme.mixins.bigButton};
    margin-top: 50px;
  }
  .robot-images {
    column-count: 3;
    column-gap: 20px;

    img {
      width: 100%;
      height: auto;
      object-fit: cover;
      display: inline-block;
      margin-bottom: 20px;
    }
  }
`;
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const Robots = () => {
    const revealContainer = useRef(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    const [robotImages, setRobotImages] = useState([RobotImage1, RobotImage3, RobotImage4, RobotImage5, RobotImage6, RobotImage7, RobotImage8, RobotImage9, RobotImage10, RobotImage11, RobotImage12, RobotImage13, RobotImage14, RobotImage2]);

    useEffect(() => {
        if (prefersReducedMotion) {
            return;
        }

        sr.reveal(revealContainer.current, srConfig());

        const interval = setInterval(() => {
            setRobotImages(prevImages => shuffleArray([...prevImages]));
        }, 20000); // 20 seconds

        return () => clearInterval(interval); // cleanup on unmount
    }, []);
    // useEffect(() => {
    //     if (prefersReducedMotion) {
    //         return;
    //     }

    //     sr.reveal(revealContainer.current, srConfig());
    // }, []);

    return (
        <StyledContactSection id="robots" ref={revealContainer}>
            <h2 className="numbered-heading overline">Robots</h2>
            <h2 className="title">Robots I've developed or worked on</h2>
            <div className="robot-images">
                {robotImages.map((image, index) => (
                    <img key={index} src={image} alt={`Robot ${index + 1}`} />
                ))}
            </div>

        </StyledContactSection>
    );
};

export default Robots;