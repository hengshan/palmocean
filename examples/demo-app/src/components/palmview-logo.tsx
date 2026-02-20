// PalmView Logo Component — replaces Kepler.gl logo
import React from 'react';
import styled from 'styled-components';

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LogoIcon = styled.svg`
  flex-shrink: 0;
`;

const LogoText = styled.span`
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
`;

// Palm tree + eye icon representing PalmView
const PalmViewLogo = ({appName}: {appName?: string}) => (
  <LogoContainer>
    <LogoIcon
      viewBox="0 0 32 32"
      width="28"
      height="28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Palm tree */}
      <path
        d="M16 28V14"
        stroke="#6CBFB7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Palm fronds */}
      <path
        d="M16 14C16 14 10 8 6 9C10 10 14 14 16 14Z"
        fill="#6CBFB7"
        opacity="0.8"
      />
      <path
        d="M16 14C16 14 14 6 10 4C12 7 14 12 16 14Z"
        fill="#6CBFB7"
        opacity="0.9"
      />
      <path
        d="M16 14C16 14 18 6 22 4C20 7 18 12 16 14Z"
        fill="#6CBFB7"
        opacity="0.9"
      />
      <path
        d="M16 14C16 14 22 8 26 9C22 10 18 14 16 14Z"
        fill="#6CBFB7"
        opacity="0.8"
      />
      {/* Satellite/eye hint */}
      <circle cx="16" cy="14" r="2" fill="#6CBFB7" />
    </LogoIcon>
    <LogoText>{appName || 'PalmView'}</LogoText>
  </LogoContainer>
);

export default PalmViewLogo;
