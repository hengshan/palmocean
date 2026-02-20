// PalmView GeoAI Tab Icon — Brain/Neural Network
// Style: matches Kepler.gl icon system (Icons.Base, 24x24 viewBox, stroke-based)
// Author: IRIS

import React, {Component} from 'react';
import {Icons} from '@kepler.gl/components';

export default class GeoAiBrain extends Component {
  static defaultProps = {
    height: '16px',
    viewBox: '0 0 24 24',
    predefinedClassName: 'data-ex-icons-geoai-brain'
  };

  render() {
    return (
      <Icons.Base {...this.props}>
        {/* Brain outline — left hemisphere */}
        <path
          d="M12 2C9.5 2 7.5 3.2 6.5 5C5.2 5.2 4 6.5 4 8.2C3.4 9 3 10 3 11.2C3 12.8 3.8 14.2 5 15C5 16.5 6 17.8 7.5 18.2C8.2 19.3 9.5 20 11 20H12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Brain outline — right hemisphere */}
        <path
          d="M12 2C14.5 2 16.5 3.2 17.5 5C18.8 5.2 20 6.5 20 8.2C20.6 9 21 10 21 11.2C21 12.8 20.2 14.2 19 15C19 16.5 18 17.8 16.5 18.2C15.8 19.3 14.5 20 13 20H12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Central fissure */}
        <path
          d="M12 2V20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="2 2"
        />
        {/* Neural nodes — left */}
        <circle cx="7" cy="9" r="1" fill="currentColor" opacity="0.7" />
        <circle cx="8" cy="13" r="1" fill="currentColor" opacity="0.7" />
        {/* Neural nodes — right */}
        <circle cx="17" cy="9" r="1" fill="currentColor" opacity="0.7" />
        <circle cx="16" cy="13" r="1" fill="currentColor" opacity="0.7" />
        {/* Neural connections */}
        <path
          d="M7 9L12 7M17 9L12 7M8 13L12 14M16 13L12 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.5"
        />
        {/* Stem / signal out */}
        <path
          d="M12 20V22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </Icons.Base>
    );
  }
}
