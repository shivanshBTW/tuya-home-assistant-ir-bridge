import type { CatalogIrCodeKind } from './tuya/irFrame.js';

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

export interface IrDecode {
  kind: CatalogIrCodeKind;
  pulseCount: number;
  pulses: number[];
  hex: string;
  base64: string;
  symbols: string;
  bits: string;
}

export interface IrPulseDiff {
  index: number;
  left?: number;
  right?: number;
}

export interface IrBitDiff {
  index: number;
  left?: string;
  right?: string;
}

export interface StudyCapture {
  id: string;
  receivedAt: string;
  code: string;
  kind: CatalogIrCodeKind;
  pulseCount: number;
}

export interface StudySavedButton {
  id: string;
  captureId: string;
  label: string;
  notes?: string;
}

export interface StudyFile {
  updatedAt: string;
  log: StudyCapture[];
  savedButtons: StudySavedButton[];
}

export interface SendResult {
  path: SendPath;
  buttonId: string;
  remoteId: string;
}

export interface CatalogRemoteBitsSummary {
  remoteId: string;
  remoteName?: string;
  buttonCount: number;
}

export interface CatalogRemoteBitButton {
  id: string;
  key: string;
  keyName: string;
  kind: CatalogIrCodeKind;
  bits: string;
  pulseCount: number;
}

export interface CatalogRemoteBits {
  remotes: CatalogRemoteBitsSummary[];
  selectedRemoteId: string;
  remoteName?: string;
  buttons: CatalogRemoteBitButton[];
}
