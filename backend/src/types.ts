export type SendPath = 'local' | 'cloud';

export type ButtonSource = 'key' | 'learned';

export interface LocalDevice {
  id: string;
  key?: string;
  host?: string;
  mac?: string;
  version?: string;
  irSendDp?: string;
  dps?: Record<string, unknown>;
}

export interface CatalogButton {
  id: string;
  remoteId: string;
  key: string;
  keyName: string;
  code?: string;
  source: ButtonSource;
  raw: unknown;
}

export interface CatalogRemote {
  remoteId: string;
  remoteName?: string;
  categoryId?: number;
  brandId?: number;
  brandName?: string;
  remoteIndex?: number;
  remote: unknown;
  keys: unknown;
  learningCodes: unknown;
  codeLibrary?: unknown;
  buttons: CatalogButton[];
}

export interface Catalog {
  infraredId: string;
  exportedAt: string;
  local: LocalDevice;
  remotes: CatalogRemote[];
}

export type DeviceTemplateId = 'fan' | 'tv' | 'soundbar' | 'ac';

export interface SlotDefinition {
  id: string;
  label: string;
  isRequired: boolean;
}

export interface DeviceTemplate {
  id: DeviceTemplateId;
  label: string;
  slots: SlotDefinition[];
}

export interface MappedSlot {
  buttonId: string;
}

export interface FanAssumedState {
  isOn: boolean;
  speed: number;
  isLedOn: boolean;
}

export interface MediaAssumedState {
  isOn: boolean;
  isMuted: boolean;
  source?: string;
}

export interface ClimateAssumedState {
  isOn: boolean;
  mode?: string;
  temperatureC?: number;
  fanMode?: string;
  powerSaving?: string;
}

export interface DeviceMapping {
  id: string;
  name: string;
  template: DeviceTemplateId;
  tuyaRemoteId: string;
  slots: Record<string, MappedSlot>;
  assumedState: FanAssumedState | MediaAssumedState | ClimateAssumedState;
}

export interface MappingFile {
  updatedAt: string;
  devices: DeviceMapping[];
}

export interface SendResult {
  path: SendPath;
  buttonId: string;
  remoteId: string;
}
