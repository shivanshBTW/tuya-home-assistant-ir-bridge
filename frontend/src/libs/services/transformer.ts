import type {
  Catalog,
  CatalogAPI,
  CatalogButton,
  CatalogButtonAPI,
  CatalogRemote,
  CatalogRemoteAPI,
  DeviceMapping,
  DeviceMappingAPI,
  DeviceTemplate,
  DeviceTemplateAPI,
  SlotDefinition,
  SlotDefinitionAPI,
} from './types';

export const transformCatalogButtonFromAPI = (button: CatalogButtonAPI): CatalogButton => {
  return {
    id: button.id,
    remoteId: button.remoteId,
    key: button.key,
    keyName: button.keyName,
    source: button.source,
    hasCode: button.hasCode,
  };
};

export const transformCatalogRemoteFromAPI = (remote: CatalogRemoteAPI): CatalogRemote => {
  return {
    remoteId: remote.remoteId,
    remoteName: remote.remoteName ?? remote.remoteId,
    buttons: remote.buttons.map(transformCatalogButtonFromAPI),
  };
};

export const transformCatalogFromAPI = (catalog: CatalogAPI): Catalog => {
  return {
    infraredId: catalog.infraredId,
    exportedAt: catalog.exportedAt,
    localHost: catalog.local.host,
    remotes: catalog.remotes.map(transformCatalogRemoteFromAPI),
  };
};

export const transformSlotDefinitionFromAPI = (slot: SlotDefinitionAPI): SlotDefinition => {
  return {
    id: slot.id,
    label: slot.label,
    isRequired: slot.isRequired,
  };
};

export const transformDeviceTemplateFromAPI = (template: DeviceTemplateAPI): DeviceTemplate => {
  return {
    id: template.id,
    label: template.label,
    slots: template.slots.map(transformSlotDefinitionFromAPI),
  };
};

export const transformDeviceMappingFromAPI = (device: DeviceMappingAPI): DeviceMapping => {
  return {
    id: device.id,
    name: device.name,
    template: device.template,
    tuyaRemoteId: device.tuyaRemoteId,
    slots: device.slots,
  };
};
