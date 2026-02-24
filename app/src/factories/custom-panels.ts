// Combined Custom Panels Factory — registers both GeoAI and Data tabs
// Kepler's CustomPanelsFactory only allows one replacement, so we merge panels here.

import GeoAiCustomPanelsFactory from '../components/geoai-panel';
import DataTabFactory from '../components/data-panel';

function PalmViewCustomPanelsFactory() {
  const GeoAiPanels = GeoAiCustomPanelsFactory();
  const DataPanels = DataTabFactory();

  const CustomPanels: any = () => null;

  // Merge panels from both factories
  CustomPanels.panels = [
    ...(GeoAiPanels.panels || []),
    ...(DataPanels.panels || []),
  ];

  CustomPanels.getProps = () => ({});

  return CustomPanels;
}

PalmViewCustomPanelsFactory.deps = [];

export default PalmViewCustomPanelsFactory;
