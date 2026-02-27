// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React from 'react';
import styled from 'styled-components';
import {KEPLER_GL_VERSION} from '@kepler.gl/constants';

const SYNGA_NAME = 'Synga';
const SYNGA_WEBSITE = 'https://synga.ai';

const LogoTitle = styled.div`
  display: inline-block;
  margin-left: 6px;
`;

const LogoName = styled.div`
  .logo__link {
    color: ${props => props.theme.logoColor};
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 1.17px;
  }
`;
const LogoVersion = styled.div`
  font-size: 10px;
  color: ${props => props.theme.subtextColor};
  letter-spacing: 0.83px;
  line-height: 14px;
`;

const LogoWrapper = styled.div`
  display: flex;
  align-items: flex-start;
`;

const LogoSvgWrapper = styled.div`
  margin-top: 3px;
`;

const LogoSvg = () => (
  <svg className="side-panel-logo__logo" width="18px" height="18px" viewBox="0 0 18 18">
    {/* Synga star mark — four-pointed diamond */}
    <polygon points="9,1 11.5,7.5 18,9 11.5,10.5 9,17 6.5,10.5 0,9 6.5,7.5" fill="#00c4b0" />
  </svg>
);
interface KeplerGlLogoProps {
  appName?: string;
  version?: string | boolean;
  appWebsite?: string;
}

const KeplerGlLogo = ({
  appName = SYNGA_NAME,
  appWebsite = SYNGA_WEBSITE,
  version = KEPLER_GL_VERSION
}: KeplerGlLogoProps) => (
  <LogoWrapper className="side-panel-logo">
    <LogoSvgWrapper>
      <LogoSvg />
    </LogoSvgWrapper>
    <LogoTitle className="logo__title">
      <LogoName className="logo__name">
        <a className="logo__link" target="_blank" rel="noopener noreferrer" href={appWebsite}>
          {appName}
        </a>
      </LogoName>
      {version ? <LogoVersion className="logo__version">{version}</LogoVersion> : null}
    </LogoTitle>
  </LogoWrapper>
);

export default KeplerGlLogo;
