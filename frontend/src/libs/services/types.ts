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
  symbols: string;
  bits: string;
}

export interface IrPulseDiffAPI {
  index: number;
  left?: number;
  right?: number;
}

export interface IrBitDiffAPI {
  index: number;
  left?: string;
  right?: string;
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
  bitDiffs: IrBitDiffAPI[];
}

export interface CatalogRemoteBitsSummaryAPI {
  remoteId: string;
  remoteName?: string;
  buttonCount: number;
}

export interface CatalogRemoteBitButtonAPI {
  id: string;
  key: string;
  keyName: string;
  kind: CatalogIrCodeKindAPI;
  bits: string;
  pulseCount: number;
}

export interface CatalogRemoteBitsAPI {
  remotes: CatalogRemoteBitsSummaryAPI[];
  selectedRemoteId: string;
  remoteName?: string;
  buttons: CatalogRemoteBitButtonAPI[];
}

export type CatalogRemoteBitsSummary = CatalogRemoteBitsSummaryAPI;
export type CatalogRemoteBitButton = CatalogRemoteBitButtonAPI;
export type CatalogRemoteBits = CatalogRemoteBitsAPI;

export type IrDecode = IrDecodeAPI;
export type IrPulseDiff = IrPulseDiffAPI;
export type IrBitDiff = IrBitDiffAPI;
export type StudyCapture = StudyCaptureAPI;
export type StudySavedButton = StudySavedButtonAPI;
export type StudyFile = StudyFileAPI;
export type StudyListenResult = StudyListenResultAPI;
export type StudyReplayResult = StudyReplayResultAPI;
export type StudyDiff = StudyDiffAPI;

export type TrainerConstraintKindAPI = 'off' | 'all' | 'some';
export type TrainerSampleSourceAPI = 'remote' | 'text';
export type TrainerFieldKindAPI = 'linear' | 'lookup' | 'unresolved';
export type TrainerDisabledRoleAPI = 'constant' | 'sticky' | 'omitted' | 'active';
export type TrainerCaptureKindAPI = 'cycle' | 'probe';

export interface TrainerParamOptionAPI {
  id: string;
  label: string;
}

export interface TrainerParamAPI {
  id: string;
  label: string;
  options: TrainerParamOptionAPI[];
}

export interface TrainerConstraintAPI {
  kind: TrainerConstraintKindAPI;
  optionIds?: string[];
}

export interface TrainerSchemaAPI {
  params: TrainerParamAPI[];
  primaryParamId: string;
  constraints: Record<string, Record<string, TrainerConstraintAPI>>;
  anchorValues: Record<string, string>;
}

export interface TrainerSampleAPI {
  id: string;
  receivedAt: string;
  source: TrainerSampleSourceAPI;
  paramValues: Record<string, string>;
  unlockedParamId: string;
  probeParamId?: string;
  probeIndex?: number;
  kind: CatalogIrCodeKindAPI;
  pulseCount: number;
  bits: string;
}

export interface TrainerParamFieldAPI {
  paramId: string;
  bitIndexes: number[];
  kind: TrainerFieldKindAPI;
  lookup: Record<string, string>;
  unresolvedReason?: string;
}

export interface TrainerDisabledNoteAPI {
  primaryOptionId: string;
  paramId: string;
  role: TrainerDisabledRoleAPI;
  detail?: string;
}

export interface TrainerInferenceAPI {
  fields: TrainerParamFieldAPI[];
  checksumIndexes: number[];
  disabledNotes: TrainerDisabledNoteAPI[];
  unresolved: string[];
}

export interface TrainerCaptureStepAPI {
  id: string;
  kind: TrainerCaptureKindAPI;
  unlockedParamId: string;
  paramValues: Record<string, string>;
  probeParamId?: string;
  probeIndex?: number;
  label: string;
}

export interface TrainerFileAPI {
  updatedAt: string;
  schema: TrainerSchemaAPI;
  samples: TrainerSampleAPI[];
  inference?: TrainerInferenceAPI;
  capturePlan: TrainerCaptureStepAPI[];
}

export type TrainerConstraint = TrainerConstraintAPI;
export type TrainerSchema = TrainerSchemaAPI;
export type TrainerSample = TrainerSampleAPI;
export type TrainerInference = TrainerInferenceAPI;
export type TrainerCaptureStep = TrainerCaptureStepAPI;
export type TrainerFile = TrainerFileAPI;
