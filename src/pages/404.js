import React, { useState, useEffect } from 'react';
import { Link } from 'gatsby';
import { Helmet } from 'react-helmet';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { navDelay } from '@utils';
import { Layout, LostRobot } from '@components';
import { usePrefersReducedMotion } from '@hooks';

const StyledMainContainer = styled.main`
  ${({ theme }) => theme.mixins.flexCenter};
  flex-direction: column;
`;
const StyledTitle = styled.h1`
  color: var(--green);
  font-family: var(--font-mono);
  font-size: clamp(100px, 25vw, 200px);
  line-height: 1;
`;
const StyledSubtitle = styled.h2`
  font-size: clamp(30px, 5vw, 50px);
  font-weight: 400;
`;
const StyledLog = styled.ul`
  ${({ theme }) => theme.mixins.resetList};
  margin: 20px 0 0;
  color: var(--slate);
  font-family: var(--font-mono);
  font-size: var(--fz-xs);
  text-align: left;

  li {
    margin: 6px 0;

    &:before {
      content: '>';
      margin-right: 10px;
      color: var(--green);
    }
  }

  .ok {
    color: var(--green);
  }

  .caret {
    display: inline-block;
    width: 8px;
    background-color: var(--green);
    animation: caret-blink 1s step-end infinite;
    color: transparent;
  }

  @keyframes caret-blink {
    50% {
      opacity: 0;
    }
  }
`;
const StyledHomeButton = styled(Link)`
  ${({ theme }) => theme.mixins.bigButton};
  margin-top: 40px;
`;

const NotFoundPage = ({ location }) => {
  const [isMounted, setIsMounted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const timeout = setTimeout(() => setIsMounted(true), navDelay);
    return () => clearTimeout(timeout);
  }, []);

  const requested = location.pathname && location.pathname !== '/' ? location.pathname : '/here';

  const content = (
    <StyledMainContainer className="fillHeight">
      <StyledTitle>404</StyledTitle>
      <StyledSubtitle>Path not found</StyledSubtitle>

      <StyledLog>
        <li>
          planner: no route to <span className="ok">{requested}</span>
        </li>
        <li>
          replanning<span className="caret">.</span>
        </li>
      </StyledLog>

      <LostRobot />

      <StyledHomeButton to="/">Go Home</StyledHomeButton>
    </StyledMainContainer>
  );

  return (
    <Layout location={location} showCursorRobot={false}>
      <Helmet title="Page Not Found" />

      {prefersReducedMotion ? (
        <>{content}</>
      ) : (
        <TransitionGroup component={null}>
          {isMounted && (
            <CSSTransition timeout={500} classNames="fadeup">
              {content}
            </CSSTransition>
          )}
        </TransitionGroup>
      )}
    </Layout>
  );
};

NotFoundPage.propTypes = {
  location: PropTypes.object.isRequired,
};

export default NotFoundPage;
