import { requestBridge } from './bridgeClient';
import {
  transformCatalogFromAPI,
  transformDeviceMappingFromAPI,
  transformDeviceTemplateFromAPI,
} from './transformer';
import type {
  Catalog,
  CatalogAPI,
  DeviceMapping,
  DeviceTemplate,
  DeviceTemplateAPI,
  LocalHostStatus,
  LocalHostStatusAPI,
  MappingFileAPI,
  StudyDiff,
  StudyDiffAPI,
  StudyFile,
  StudyFileAPI,
  StudyListenResult,
  StudyListenResultAPI,
  StudyReplayResult,
  StudyReplayResultAPI,
} from './types';

const STUDY_LISTEN_TIMEOUT_MS = 32_000;

export const fetchLocalHost = async ({
  shouldScanSubnet = false,
}: {
  shouldScanSubnet?: boolean;
} = {}): Promise<LocalHostStatus> => {
  const query = shouldScanSubnet ? '?scan=1' : '';
  return requestBridge<LocalHostStatusAPI>({ path: `/api/local-host${query}` });
};

export const fetchCatalog = async (): Promise<Catalog | null> => {
  const response = await requestBridge<{ catalog: CatalogAPI | null }>({ path: '/api/catalog' });
  if (!response.catalog) {
    return null;
  }
  return transformCatalogFromAPI(response.catalog);
};

export const exportCatalog = async (): Promise<Catalog> => {
  const response = await requestBridge<{ catalog: CatalogAPI }>({
    path: '/api/export',
    method: 'POST',
  });
  return transformCatalogFromAPI(response.catalog);
};

export const fetchTemplates = async (): Promise<DeviceTemplate[]> => {
  const response = await requestBridge<{ templates: DeviceTemplateAPI[] }>({
    path: '/api/templates',
  });
  return response.templates.map(transformDeviceTemplateFromAPI);
};

export const fetchMappings = async (): Promise<DeviceMapping[]> => {
  const response = await requestBridge<MappingFileAPI>({ path: '/api/mappings' });
  return response.devices.map(transformDeviceMappingFromAPI);
};

export const saveMappings = async (devices: DeviceMapping[]): Promise<DeviceMapping[]> => {
  const response = await requestBridge<MappingFileAPI>({
    path: '/api/mappings',
    method: 'PUT',
    body: { devices },
  });
  return response.devices.map(transformDeviceMappingFromAPI);
};

export const upsertMappingDevice = async (device: DeviceMapping): Promise<DeviceMapping[]> => {
  const response = await requestBridge<MappingFileAPI>({
    path: '/api/mappings/devices',
    method: 'POST',
    body: device,
  });
  return response.devices.map(transformDeviceMappingFromAPI);
};

export const testFireButton = async (buttonId: string): Promise<{ path: string }> => {
  return requestBridge<{ path: string }>({
    path: `/api/buttons/${encodeURIComponent(buttonId)}/test-fire`,
    method: 'POST',
  });
};

export const fetchStudy = async (): Promise<StudyFile> => {
  return requestBridge<StudyFileAPI>({ path: '/api/study' });
};

export const listenStudyCapture = async (): Promise<StudyListenResult> => {
  return requestBridge<StudyListenResultAPI>({
    path: '/api/study/listen',
    method: 'POST',
    timeoutMs: STUDY_LISTEN_TIMEOUT_MS,
  });
};

export const saveStudyButton = async ({
  captureId,
  label,
  notes,
}: {
  captureId: string;
  label: string;
  notes?: string;
}): Promise<StudyFile> => {
  return requestBridge<StudyFileAPI>({
    path: '/api/study/buttons',
    method: 'POST',
    body: { captureId, label, notes },
  });
};

export const replayStudyCapture = async (captureId: string): Promise<StudyReplayResult> => {
  return requestBridge<StudyReplayResultAPI>({
    path: `/api/study/replay/${encodeURIComponent(captureId)}`,
    method: 'POST',
  });
};

export const fetchStudyDiff = async ({
  leftCaptureId,
  rightCaptureId,
}: {
  leftCaptureId: string;
  rightCaptureId: string;
}): Promise<StudyDiff> => {
  const params = new URLSearchParams({
    left: leftCaptureId,
    right: rightCaptureId,
  });
  return requestBridge<StudyDiffAPI>({ path: `/api/study/diff?${params.toString()}` });
};
