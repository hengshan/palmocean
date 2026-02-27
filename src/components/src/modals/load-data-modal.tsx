// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useState} from 'react';
import styled from 'styled-components';
import get from 'lodash/get';
import {IntlShape, useIntl} from 'react-intl';

import FileUploadFactory from '../common/file-uploader/file-upload';
import LoadStorageMapFactory from './load-storage-map';
import LoadTilesetFactory from './tilesets-modals/load-tileset';
import ModalTabsFactory from './modal-tabs';
import LoadingDialog from './loading-dialog';
import SampleDataPanelFactory from './sample-data-panel';
import {DatasetStatusBar} from './dataset-status-bar';

import {LOADING_METHODS} from '@kepler.gl/constants';
import {FileLoading, FileLoadingProgress, LoadFiles} from '@kepler.gl/types';

// ─── Styled Components ───────────────────────────────────────────────────────

const StyledLoadDataModal = styled.div.attrs({
  className: 'load-data-modal'
})`
  padding: ${props => props.theme.modalPadding};
  min-height: 440px;
  display: flex;
  flex-direction: column;
`;

const noop = () => {
  return;
};

const getDefaultMethod = <T,>(methods: T[] = []) =>
  Array.isArray(methods) ? get(methods, [0]) : null;

// ─── LoadingMethod Interface ──────────────────────────────────────────────────

export interface LoadingMethod {
  id: string;
  label: string;
  icon?: string;
  hidden?: boolean;
  elementType: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  tabElementType?: React.ComponentType<{onClick: React.MouseEventHandler; intl: IntlShape}>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const LOADING_METHOD_REGISTRY = new Map<string, LoadingMethod>();

export function registerLoadingMethod(method: LoadingMethod): void {
  LOADING_METHOD_REGISTRY.set(method.id, method);
}

// ─── Props ───────────────────────────────────────────────────────────────────

export type LoadDataModalProps = {
  // callbacks
  onFileUpload: (files: File[]) => void;
  onLoadCloudMap: (provider: unknown, vis: unknown) => void;
  onTilesetAdded: (
    tileset: {name: string; type: string; metadata: Record<string, unknown>},
    processedMetadata?: Record<string, unknown>
  ) => void;
  fileLoading: FileLoading | false;
  loadingMethods?: LoadingMethod[];
  /** A list of names of supported formats suitable to present to user */
  fileFormatNames: string[];
  /** A list of typically 3 letter extensions (without '.') for file matching */
  fileExtensions: string[];
  isCloudMapLoading: boolean;
  /** Set to true if app wants to do its own file filtering */
  disableExtensionFilter?: boolean;
  onClose?: (...args: unknown[]) => unknown;
  loadFiles: LoadFiles;
  fileLoadingProgress: FileLoadingProgress;
  /** Currently loaded datasets — used to show DatasetStatusBar */
  datasets?: Record<string, unknown>;
};

// ─── Factory ─────────────────────────────────────────────────────────────────

LoadDataModalFactory.deps = [
  ModalTabsFactory,
  FileUploadFactory,
  LoadStorageMapFactory,
  LoadTilesetFactory,
  SampleDataPanelFactory
];

export function LoadDataModalFactory(
  ModalTabs: ReturnType<typeof ModalTabsFactory>,
  FileUpload: ReturnType<typeof FileUploadFactory>,
  LoadStorageMap: ReturnType<typeof LoadStorageMapFactory>,
  LoadTileset: ReturnType<typeof LoadTilesetFactory>,
  SampleDataPanel: ReturnType<typeof SampleDataPanelFactory>
) {
  // ── Populate registry ──────────────────────────────────────────────────────
  registerLoadingMethod({
    id: LOADING_METHODS.upload,
    label: 'modal.loadData.upload',
    icon: '📁',
    elementType: FileUpload
  });

  registerLoadingMethod({
    id: LOADING_METHODS.tileset,
    label: 'modal.loadData.remote',
    icon: '🌐',
    elementType: LoadTileset
  });

  registerLoadingMethod({
    id: 'sample',
    label: 'modal.loadData.sample',
    icon: '📊',
    elementType: SampleDataPanel
  });

  registerLoadingMethod({
    id: LOADING_METHODS.storage,
    label: 'modal.loadData.storage',
    icon: '☁️',
    hidden: true,
    elementType: LoadStorageMap
  });

  // Visible methods derived from registry (excluding hidden)
  const registryMethods = (): LoadingMethod[] =>
    Array.from(LOADING_METHOD_REGISTRY.values()).filter(m => !m.hidden);

  const LoadDataModal: React.FC<LoadDataModalProps> & {
    defaultLoadingMethods: LoadDataModalProps['loadingMethods'];
  } = ({
    onFileUpload = noop,
    onTilesetAdded = noop,
    fileLoading = false,
    loadingMethods,
    datasets,
    isCloudMapLoading,
    ...restProps
  }) => {
    const intl = useIntl();

    // Use provided loadingMethods, or derive from registry (filtered by !hidden)
    const resolvedMethods = loadingMethods ?? registryMethods();

    const currentModalProps = {
      ...restProps,
      onFileUpload,
      onTilesetAdded,
      fileLoading,
      isCloudMapLoading
    };

    const [currentMethod, toggleMethod] = useState(getDefaultMethod(resolvedMethods));

    const ElementType = currentMethod?.elementType;
    const datasetCount = Object.keys(datasets ?? {}).length;

    return (
      <StyledLoadDataModal>
        <DatasetStatusBar datasetCount={datasetCount} />
        <ModalTabs
          currentMethod={currentMethod?.id}
          loadingMethods={resolvedMethods}
          toggleMethod={toggleMethod}
        />
        {isCloudMapLoading ? (
          <LoadingDialog size={64} />
        ) : (
          ElementType && <ElementType key={currentMethod?.id} intl={intl} {...currentModalProps} />
        )}
      </StyledLoadDataModal>
    );
  };

  // Keep backward-compat static field
  LoadDataModal.defaultLoadingMethods = registryMethods();

  return LoadDataModal;
}

export default LoadDataModalFactory;
