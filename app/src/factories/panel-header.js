// SPDX-License-Identifier: MIT
// PalmView — Custom Panel Header (branding + links)

import {PanelHeaderFactory, Icons} from '@kepler.gl/components';
import PalmViewLogo from '../components/palmview-logo';

const PALMVIEW_BUG_REPORT = 'https://github.com/hengshan/kepler.gl/issues';
const PALMVIEW_USER_GUIDE = 'https://github.com/hengshan/kepler.gl/wiki';

export function CustomPanelHeaderFactory(...deps) {
  const PanelHeader = PanelHeaderFactory(...deps);
  const defaultActionItems = PanelHeader.defaultProps.actionItems;

  PanelHeader.defaultProps = {
    ...PanelHeader.defaultProps,
    logoComponent: PalmViewLogo,
    actionItems: [
      {
        id: 'bug',
        iconComponent: Icons.Bug,
        href: PALMVIEW_BUG_REPORT,
        blank: true,
        tooltip: 'Report Issue',
        onClick: () => {}
      },
      {
        id: 'docs',
        iconComponent: Icons.Docs2,
        href: PALMVIEW_USER_GUIDE,
        blank: true,
        tooltip: 'User Guide',
        onClick: () => {}
      },
      defaultActionItems.find(item => item.id === 'storage'),
      {
        ...defaultActionItems.find(item => item.id === 'save'),
        label: null,
        tooltip: 'Share'
      }
    ]
  };
  return PanelHeader;
}

CustomPanelHeaderFactory.deps = PanelHeaderFactory.deps;

export function replacePanelHeader() {
  return [PanelHeaderFactory, CustomPanelHeaderFactory];
}
