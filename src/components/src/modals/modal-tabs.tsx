// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback} from 'react';
import classnames from 'classnames';
import styled from 'styled-components';
import {media} from '@kepler.gl/styles';
import {FormattedMessage, useIntl} from 'react-intl';
import {LoadingMethod} from './load-data-modal';

// ─── Styled Components ───────────────────────────────────────────────────────

/** Container row — no full-width underline */
const ModalTab = styled.div`
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  ${media.portable`
    gap: 4px;
  `};
`;

/** Card-style tab pill */
const StyledLoadDataModalTabItem = styled.div`
  width: 80px;
  height: 64px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  transition: background 0.15s, border-bottom-color 0.15s;
  color: ${props => props.theme.subtextColor || 'rgba(255,255,255,0.5)'};

  &.active {
    background: rgba(255, 255, 255, 0.08);
    border-bottom-color: ${props =>
      (props.theme as {activeColor?: string}).activeColor || '#00c4b0'};
    color: ${props => props.theme.textColorHl || '#fff'};
  }

  &:hover:not(.active) {
    background: rgba(255, 255, 255, 0.04);
    color: ${props => props.theme.textColor || 'rgba(255,255,255,0.8)'};
  }

  ${media.portable`
    width: 64px;
    height: 54px;
  `};
`;

const TabIcon = styled.span`
  font-size: 20px;
  line-height: 1;
`;

const TabLabel = styled.span`
  font-size: 11px;
  font-weight: 400;
  text-align: center;
  line-height: 1.2;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// ─── Sub-components ──────────────────────────────────────────────────────────

const noop = () => {
  return;
};

interface ModalTabItemProps {
  currentMethod?: string;
  method: LoadingMethod;
  toggleMethod: (method: LoadingMethod) => void;
}

interface ModalTabProps {
  loadingMethods: LoadingMethod[];
  toggleMethod: (method: LoadingMethod) => void;
  currentMethod?: string;
}

export const ModalTabItem: React.FC<ModalTabItemProps> = ({
  currentMethod,
  method,
  toggleMethod
}) => {
  const onClick = useCallback(() => toggleMethod(method), [method, toggleMethod]);
  const intl = useIntl();

  if (method.tabElementType) {
    return <method.tabElementType onClick={onClick} intl={intl} />;
  }

  const isActive = !!(currentMethod && method.id === currentMethod);

  return (
    <StyledLoadDataModalTabItem
      className={classnames('load-data-modal__tab__item', {active: isActive})}
      onClick={onClick}
    >
      {method.icon && <TabIcon>{method.icon}</TabIcon>}
      <TabLabel>
        {method.label ? <FormattedMessage id={method.label} /> : method.id}
      </TabLabel>
    </StyledLoadDataModalTabItem>
  );
};

// ─── Factory ─────────────────────────────────────────────────────────────────

function ModalTabsFactory() {
  const ModalTabs: React.FC<ModalTabProps> = ({
    currentMethod,
    toggleMethod = noop,
    loadingMethods = []
  }) => (
    <ModalTab className="load-data-modal__tab">
      {loadingMethods.map(method => (
        <ModalTabItem
          key={method.id}
          method={method}
          currentMethod={currentMethod}
          toggleMethod={toggleMethod}
        />
      ))}
    </ModalTab>
  );

  return ModalTabs;
}

export default ModalTabsFactory;
