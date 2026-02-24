// PalmView Logo Component — uses Synga official branding
import React from 'react';
import styled from 'styled-components';

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LogoText = styled.span`
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #1FBF6E;
`;

// Synga official logo SVG (from synga.git/public/images/logos/synga-icon-green.svg)
const SyngaIcon = ({size = 24}: {size?: number}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    fill="none"
    width={size}
    height={size}
  >
    <circle cx="50" cy="50" r="32" stroke="#1FBF6E" strokeWidth="3.5" />
    <line x1="50" y1="38" x2="50" y2="14" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="59" y1="40" x2="76" y2="22" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="62" y1="50" x2="86" y2="50" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="59" y1="59" x2="76" y2="77" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="50" y1="62" x2="50" y2="86" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="41" y1="59" x2="24" y2="77" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="38" y1="50" x2="14" y2="50" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="41" y1="40" x2="24" y2="22" stroke="#1FBF6E" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="50" cy="50" r="9" fill="#1FBF6E" />
  </svg>
);

const PalmViewLogo = ({appName}: {appName?: string}) => (
  <LogoContainer>
    <SyngaIcon size={28} />
    <LogoText>{appName || 'PalmView'}</LogoText>
  </LogoContainer>
);

export default PalmViewLogo;
