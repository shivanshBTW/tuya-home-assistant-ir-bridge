export type ButtonSourceAPI = 'key' | 'learned';

export type DeviceTemplateIdAPI = 'fan' | 'tv' | 'soundbar' | 'ac';

export interface CatalogButtonAPI {
  id: string;
  remoteId: string;
  key: string;
  keyName: string;
  source: ButtonSourceAPI;
  hasCode: boolean;
}

export interface CatalogRemoteAPI {
  remoteId: string;
  remoteName?: string;
  categoryId?: number;
  brandId?: number;
  brandName?: string;
  remoteIndex?: number;
  buttons: CatalogButtonAPI[];
}

export interface CatalogAPI {
  infraredId: string;
  exportedAt: string;
  local: {
    id: string;
    host?: string;
    version?: string;
    irSendDp?: string;
  };
  remotes: CatalogRemoteAPI[];
}

export interface SlotDefinitionAPI {
  id: string;
  label: string;
  isRequired: boolean;
}

export interface DeviceTemplateAPI {
  id: DeviceTemplateIdAPI;
  label: string;
  slots: SlotDefinitionAPI[];
}

export interface MappedSlotAPI {
  buttonId: string;
}

export interface DeviceMappingAPI {
  id: string;
  name: string;
  template: DeviceTemplateIdAPI;
  tuyaRemoteId: string;
  slots: Record<string, MappedSlotAPI>;
  assumedState: Record<string, unknown>;
}

export interface MappingFileAPI {
  updatedAt: string;
  devices: DeviceMappingAPI[];
}

export interface CatalogButton {
  id: string;
  remoteId: string;
  key: string;
  keyName: string;
  source: ButtonSourceAPI;
  hasCode: boolean;
}

export interface CatalogRemote {
  remoteId: string;
  remoteName: string;
  buttons: CatalogButton[];
}

export interface Catalog {
  infraredId: string;
  exportedAt: string;
  remotes: CatalogRemote[];
}

export interface SlotDefinition {
  id: string;
  label: string;
  isRequired: boolean;
}

export interface DeviceTemplate {
  id: DeviceTemplateIdAPI;
  label: string;
  slots: SlotDefinition[];
}

export interface DeviceMapping {
  id: string;
  name: string;
  template: DeviceTemplateIdAPI;
  tuyaRemoteId: string;
  slots: Record<string, MappedSlotAPI>;
}
