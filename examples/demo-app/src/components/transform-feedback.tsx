// SPDX-License-Identifier: MIT
// Transform feedback tooltip – shows rotation angle / scale factor during transform operations

import React, {useEffect, useState} from 'react';
import styled from 'styled-components';

interface TransformInfo {
  type: 'rotate' | 'scale';
  angle?: number;
  factor?: number;
}

const Tooltip = styled.div`
  position: fixed;
  top: 80px;
  right: 20px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  font-family: ff-clan-web-pro, 'Helvetica Neue', Helvetica, sans-serif;
  pointer-events: none;
  z-index: 10000;
  backdrop-filter: blur(4px);
  letter-spacing: 0.3px;
  min-width: 80px;
  text-align: center;
`;

const TransformFeedback: React.FC = () => {
  const [info, setInfo] = useState<TransformInfo | null>(null);

  useEffect(() => {
    let rafId: number;
    const poll = () => {
      const current = (window as any).__PALMVIEW_TRANSFORM_INFO as TransformInfo | null;
      setInfo(prev => {
        if (current === prev) return prev;
        if (!current && !prev) return prev;
        if (current && prev && current.type === prev.type && current.angle === prev.angle && current.factor === prev.factor) return prev;
        return current;
      });
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (!info) return null;

  const label =
    info.type === 'rotate'
      ? `↻ ${(info.angle ?? 0).toFixed(1)}°`
      : `⬡ ${(info.factor ?? 1).toFixed(2)}x`;

  return <Tooltip>{label}</Tooltip>;
};

export default TransformFeedback;
