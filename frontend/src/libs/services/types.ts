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
  localHost?: string;
  remotes: CatalogRemote[];
}

export interface LocalHostStatusAPI {
  host?: string;
  hasLocalKey: boolean;
}

export interface LocalHostStatus {
  host?: string;
  hasLocalKey: boolean;
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

export type CatalogIrCodeKindAPI = 'cloud_hex' | 'symbol_key' | 'lan_base64';

export interface IrDecodeAPI {
  kind: CatalogIrCodeKindAPI;
  pulseCount: number;
  pulses: number[];
  hex: string;
  base64: string;
}

export interface IrPulseDiffAPI {
  index: number;
  left?: number;
  right?: number;
}

export interface StudyCaptureAPI {
  id: string;
  receivedAt: string;
  code: string;
  kind: CatalogIrCodeKindAPI;
  pulseCount: number;
  decode: IrDecodeAPI;
}

export interface StudySavedButtonAPI {
  id: string;
  captureId: string;
  label: string;
  notes?: string;
}

export interface StudyFileAPI {
  updatedAt: string;
  log: StudyCaptureAPI[];
  savedButtons: StudySavedButtonAPI[];
}

export interface StudyListenResultAPI {
  capture: StudyCaptureAPI;
  study: StudyFileAPI;
}

export interface StudyReplayResultAPI {
  path: string;
  captureId: string;
}

export interface StudyDiffAPI {
  left: StudyCaptureAPI;
  right: StudyCaptureAPI;
  diffs: IrPulseDiffAPI[];
}

export type IrDecode = IrDecodeAPI;
export type IrPulseDiff = IrPulseDiffAPI;
export type StudyCapture = StudyCaptureAPI;
export type StudySavedButton = StudySavedButtonAPI;
export type StudyFile = StudyFileAPI;
export type StudyListenResult = StudyListenResultAPI;
export type StudyReplayResult = StudyReplayResultAPI;
export type StudyDiff = StudyDiffAPI;
