// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {combineReducers} from 'redux';
import {handleActions} from 'redux-actions';
import Task, {withTask} from 'react-palm/tasks';

import {aiAssistantReducer} from '@kepler.gl/ai-assistant';
import {EXPORT_MAP_FORMATS} from '@kepler.gl/constants';
import {processGeojson, processRowObject, processArrowTable} from '@kepler.gl/processors';
import keplerGlReducer, {combinedUpdaters, uiStateUpdaters} from '@kepler.gl/reducers';
import KeplerGlSchema from '@kepler.gl/schemas';
import {KeplerTable} from '@kepler.gl/table';
import {getApplicationConfig} from '@kepler.gl/utils';

// import {getApplicationConfig, initApplicationConfig} from '@kepler.gl/utils';
// import keplerGlDuckdbPlugin, {KeplerGlDuckDbTable, DuckDBWasmAdapter} from '@kepler.gl/duckdb';

import {
  INIT,
  LOAD_MAP_SAMPLE_FILE,
  LOAD_REMOTE_RESOURCE_SUCCESS,
  LOAD_REMOTE_DATASET_PROCESSED_SUCCESS,
  LOAD_REMOTE_RESOURCE_ERROR,
  SET_SAMPLE_LOADING_STATUS,
  loadRemoteDatasetProcessedSuccessAction
} from '../actions';

import {CLOUD_PROVIDERS_CONFIGURATION} from '../constants/default-settings';
import {generateHashId} from '../utils/strings';

// initialize kepler demo-app with DuckDB plugin
/*
initApplicationConfig({
  // Custom UI for DuckDB
  plugins: [keplerGlDuckdbPlugin],
  // async data ingestion to DuckDb
  table: KeplerGlDuckDbTable,
  // setup database for DuckDB plugin
  database: new DuckDBWasmAdapter({
    config: {
      query: {
        castBigIntToDouble: true
      }
    }
  }),
  // progressive loading is sync, doesn't wait properly for a dataset to be created in DuckDB
  useArrowProgressiveLoading: false
});
*/

const {DEFAULT_MAP_CONTROLS} = uiStateUpdaters;

// INITIAL_APP_STATE
const initialAppState = {
  appName: 'example',
  loaded: false,
  sampleMaps: [], // this is used to store sample maps fetch from a remote json file
  isMapLoading: false, // determine whether we are loading a sample map,
  error: null // contains error when loading/retrieving data/configuration
  // {
  //   status: null,
  //   message: null
  // }
};

// App reducer
export const appReducer = handleActions(
  {
    [INIT]: state => ({
      ...state,
      loaded: true
    }),
    [LOAD_MAP_SAMPLE_FILE]: (state, action) => ({
      ...state,
      sampleMaps: action.samples
    }),
    [SET_SAMPLE_LOADING_STATUS]: (state, action) => ({
      ...state,
      isMapLoading: action.isMapLoading
    })
  },
  initialAppState
);

const {DEFAULT_EXPORT_MAP} = uiStateUpdaters;

// combine app reducer and keplerGl reducer
// to mimic the reducer state of kepler.gl website
const demoReducer = combineReducers({
  // mount keplerGl reducer
  keplerGl: keplerGlReducer.initialState({
    // Default map center: Singapore
    mapState: {
      latitude: 1.3521,
      longitude: 103.8198,
      zoom: 11
    },
    // In order to provide single file export functionality
    // we are going to set the mapbox access token to be used
    // in the exported file
    uiState: {
      exportMap: {
        ...DEFAULT_EXPORT_MAP,
        [EXPORT_MAP_FORMATS.HTML]: {
          ...DEFAULT_EXPORT_MAP[[EXPORT_MAP_FORMATS.HTML]],
          exportMapboxAccessToken: CLOUD_PROVIDERS_CONFIGURATION.EXPORT_MAPBOX_TOKEN
        }
      },
      mapControls: {
        ...DEFAULT_MAP_CONTROLS,
        // TODO find a better way not to add extra controls optionally - from plugin?
        ...((getApplicationConfig().plugins || []).some(p => p.name === 'duckdb')
          ? {
              sqlPanel: {
                active: false,
                activeMapIndex: 0,
                disableClose: false,
                show: true
              }
            }
          : {})
      }
    },
    visState: {
      loaders: [], // Add additional loaders.gl loaders here
      loadOptions: {} // Add additional loaders.gl loader options here
    },
    // ── Curated basemap list (5 basemaps, no Mapbox proprietary text styles)
    // Overrides Kepler.gl's default 9-style list.
    // CARTO styles (open, no token): dark-matter, positron, voyager
    // Mapbox satellite (token required): pure imagery, no text
    // Singapore OneMap (public tiles, no auth required for tiles)
    mapStyle: {
      styleType: 'dark-matter',
      mapStyles: {
        'dark-matter': {
          id: 'dark-matter',
          label: 'Dark',
          url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
          icon: 'https://studio-public-data.foursquare.com/statics/keplergl/geodude/DARKMATTER.png',
          layerGroups: [],
          colorMode: 'DARK',
          complimentaryStyleId: 'positron',
        },
        'positron': {
          id: 'positron',
          label: 'Light',
          url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          icon: 'https://studio-public-data.foursquare.com/statics/keplergl/geodude/POSITRON.png',
          layerGroups: [],
          colorMode: 'LIGHT',
          complimentaryStyleId: 'dark-matter',
        },
        'voyager': {
          id: 'voyager',
          label: 'Street',
          url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
          icon: 'https://studio-public-data.foursquare.com/statics/keplergl/geodude/VOYAGER.png',
          layerGroups: [],
          colorMode: 'LIGHT',
          complimentaryStyleId: 'dark-matter',
        },
        'satellite': {
          id: 'satellite',
          label: 'Satellite',
          url: 'mapbox://styles/mapbox/satellite-v9',
          icon: 'https://studio-public-data.foursquare.com/statics/keplergl/geodude/UBER_SATELLITE.png',
          layerGroups: [],
          colorMode: 'DARK',
        },
        'onemap': {
          id: 'onemap',
          label: 'OneMap',
          url: 'https://www.onemap.gov.sg/maps/json/raster/mbstyle/Default.json',
          icon: 'https://www.onemap.gov.sg/favicon.ico',
          layerGroups: [],
          colorMode: 'LIGHT',
        },
      },
    },
  }),
  app: appReducer,
  aiAssistant: aiAssistantReducer
});

async function loadRemoteResourceSuccessTask({
  dataUrl,
  datasetId,
  processorMethod,
  remoteDatasetConfig,
  unprocessedData
}) {
  if (dataUrl) {
    const data = await processorMethod(unprocessedData);
    return {
      info: {
        id: datasetId
      },
      data
    };
  }

  // remote datasets like vector tile datasets
  return remoteDatasetConfig;
}

const LOAD_REMOTE_RESOURCE_SUCCESS_TASK = Task.fromPromise(
  loadRemoteResourceSuccessTask,
  'LOAD_REMOTE_RESOURCE_SUCCESS_TASK'
);

// this can be moved into a action and call kepler.gl action
/**
 * Used to load Kepler.gl demo examples
 * @param state
 * @param action {map: resultset, config, map}
 * @returns {{app: {isMapLoading: boolean}, keplerGl: {map: (state|*)}}}
 */
export const loadRemoteResourceSuccess = (state, action) => {
  // TODO: replace generate with a different function
  const datasetId = action.options.id || generateHashId(6);
  const {dataUrl} = action.options;

  const {shape} = dataUrl ? action.response : {};
  let processorMethod = processRowObject;
  let unprocessedData = action.response;
  unprocessedData = shape === 'object-row-table' ? action.response.data : unprocessedData;

  if (dataUrl) {
    const table = getApplicationConfig().table ?? KeplerTable;
    if (typeof table.getFileProcessor === 'function') {
      if (shape === 'arrow-table') {
        // arrow processor from table plugin expects batches
        unprocessedData = action.response.data.batches;
      }
      // use custom processors from table class
      const processorResult = table.getFileProcessor(unprocessedData);
      // TODO save processorResult.format here with the dataset
      processorMethod = processorResult.processor;
    } else {
      if (shape === 'arrow-table') {
        processorMethod = processArrowTable;
      } else if (shape === 'object-row-table') {
        processorMethod = processRowObject;
      } else if (dataUrl.includes('.json') || dataUrl.includes('.geojson')) {
        processorMethod = processGeojson;
      } else {
        throw new Error('Failed to select data processor');
      }
    }
  }

  // processorMethod can be async so create a task
  const task = LOAD_REMOTE_RESOURCE_SUCCESS_TASK({
    dataUrl,
    datasetId,
    processorMethod,
    remoteDatasetConfig: action.remoteDatasetConfig,
    unprocessedData
  }).bimap(
    datasets => loadRemoteDatasetProcessedSuccessAction({...action, datasets}),
    () => {
      throw new Error('loadRemoteResource data processor failed');
    }
  );

  return withTask(state, task);
};

const loadRemoteDatasetProcessedSuccess = (state, action) => {
  const {config, datasets, options} = action.payload;

  const parsedConfig = config ? KeplerGlSchema.parseSavedConfig(config) : null;

  // a hack to use minZoom and maxZoom from examples
  if (parsedConfig?.mapState) {
    if (typeof config?.config?.mapState?.maxZoom === 'number') {
      parsedConfig.mapState.maxZoom = config.config.mapState.maxZoom;
    }
    if (typeof config?.config?.mapState?.minZoom === 'number') {
      parsedConfig.mapState.minZoom = config.config.mapState.minZoom;
    }
  }

  const keplerGlInstance = combinedUpdaters.addDataToMapUpdater(
    state.keplerGl.map, // "map" is the id of your kepler.gl instance
    {
      payload: {
        datasets,
        config: parsedConfig,
        options: {
          centerMap: Boolean(!config)
        }
      }
    }
  );

  return {
    ...state,
    app: {
      ...state.app,
      currentSample: options,
      isMapLoading: false // we turn off the spinner
    },
    keplerGl: {
      ...state.keplerGl, // in case you keep multiple instances
      map: keplerGlInstance
    }
  };
};

export const loadRemoteResourceError = (state, action) => {
  const {error, url} = action;

  const errorNote = {
    type: 'error',
    message: error.message || `Error loading ${url}`
  };

  return {
    ...state,
    app: {
      ...state.app,
      isMapLoading: false // we turn of the spinner
    },
    keplerGl: {
      ...state.keplerGl, // in case you keep multiple instances
      map: {
        ...state.keplerGl.map,
        uiState: uiStateUpdaters.addNotificationUpdater(state.keplerGl.map.uiState, {
          payload: errorNote
        })
      }
    }
  };
};

const composedUpdaters = {
  [LOAD_REMOTE_RESOURCE_SUCCESS]: loadRemoteResourceSuccess,
  [LOAD_REMOTE_DATASET_PROCESSED_SUCCESS]: loadRemoteDatasetProcessedSuccess,
  [LOAD_REMOTE_RESOURCE_ERROR]: loadRemoteResourceError
};

const composedReducer = (state, action) => {
  if (composedUpdaters[action.type]) {
    return composedUpdaters[action.type](state, action);
  }
  return demoReducer(state, action);
};

// export demoReducer to be combined in website app
export default composedReducer;
