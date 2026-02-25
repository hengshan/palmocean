// Combined Custom Panels Factory — registers GeoAI, Data, and Add Data tabs
// Kepler's CustomPanelsFactory only allows one replacement, so we merge panels here.

import GeoAiCustomPanelsFactory from '../components/geoai-panel';
import DataTabFactory from '../components/data-panel';
import AddDataTabFactory from '../palmview/components/AddDataTab';

function PalmViewCustomPanelsFactory() {
  const GeoAiPanels = GeoAiCustomPanelsFactory();
  const DataPanels = DataTabFactory();
  const AddDataPanels = AddDataTabFactory();

  const CustomPanels: any = () => null;

  // Merge panels — AddData first (T4: unified entry point sits before other tabs)
  CustomPanels.panels = [
    ...(AddDataPanels.panels || []),
    ...(GeoAiPanels.panels || []),
    ...(DataPanels.panels || []),
  ];

  CustomPanels.getProps = () => ({});

  return CustomPanels;
}

PalmViewCustomPanelsFactory.deps = [];

export default PalmViewCustomPanelsFactory;
