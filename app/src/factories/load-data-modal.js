// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {LoadDataModalFactory, withState, registerLoadingMethod} from '@kepler.gl/components';
import {LOADING_METHODS} from '../constants/default-settings';

import SampleMapGallery from '../components/load-data-modal/sample-data-viewer';
import LoadRemoteMap from '../components/load-data-modal/load-remote-map';
import SampleMapsTab from '../components/load-data-modal/sample-maps-tab';
import {loadRemoteMap, loadSample, loadSampleConfigurations} from '../actions';

// Register app-specific loading methods into the Registry.
// 'upload' and 'tileset' (remote) are already registered as defaults in the Registry.
// We override 'remote' and 'sample' with app-specific elementTypes.
registerLoadingMethod({
  id: LOADING_METHODS.remote,
  label: 'modal.loadData.remote',
  elementType: LoadRemoteMap
});

registerLoadingMethod({
  id: LOADING_METHODS.sample,
  label: 'modal.loadData.sample',
  elementType: SampleMapGallery,
  tabElementType: SampleMapsTab
});

const CustomLoadDataModalFactory = (...deps) => {
  const LoadDataModal = LoadDataModalFactory(...deps);

  return withState(
    [],
    state => ({
      ...state.demo.app,
      ...state.demo.keplerGl.map.uiState,
      datasets: state.demo.keplerGl.map.visState.datasets
    }),
    {
      onLoadSample: loadSample,
      onLoadRemoteMap: loadRemoteMap,
      loadSampleConfigurations
    }
  )(LoadDataModal);
};

CustomLoadDataModalFactory.deps = LoadDataModalFactory.deps;

export function replaceLoadDataModal() {
  return [LoadDataModalFactory, CustomLoadDataModalFactory];
}
