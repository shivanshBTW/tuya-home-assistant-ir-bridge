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
  MappingFileAPI,
} from './types';

export const fetchHealth = async (): Promise<{ ok: boolean }> => {
  return requestBridge<{ ok: boolean }>({ path: '/api/health' });
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
