// Combined Custom Panels Factory — registers GeoAI, Data, Add Data, and Plantation KB tabs
// Kepler's CustomPanelsFactory only allows one replacement, so we merge panels here.

import GeoAiCustomPanelsFactory from '../components/geoai-panel';
import DataTabFactory from '../components/data-panel';
import AddDataTabFactory from '../palmview/components/AddDataTab';
import PlantationPanelFactory from '../components/plantation-panel';

function PalmViewCustomPanelsFactory() {
  const GeoAiPanels = GeoAiCustomPanelsFactory();
  const DataPanels = DataTabFactory();
  const AddDataPanels = AddDataTabFactory();
  const PlantationPanels = PlantationPanelFactory();

  const CustomPanels: any = () => null;

  // Merge panels — AddData first, then GeoAI, Plantation KB, then Data/COG
  CustomPanels.panels = [
    ...(AddDataPanels.panels || []),
    ...(GeoAiPanels.panels || []),
    ...(PlantationPanels.panels || []),
    ...(DataPanels.panels || []),
  ];

  CustomPanels.getProps = () => ({});

  return CustomPanels;
}

PalmViewCustomPanelsFactory.deps = [];

export default PalmViewCustomPanelsFactory;
