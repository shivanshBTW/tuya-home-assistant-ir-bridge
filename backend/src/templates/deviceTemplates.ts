import type { DeviceMapping, DeviceTemplate, SlotDefinition } from '../types.js';

export const FAN_SPEED_COUNT = 6;

const TV_MEDIA_PLAYER_SLOT_IDS = new Set([
  'power',
  'vol_up',
  'vol_down',
  'mute',
  'play',
  'pause',
  'source_hdmi',
]);

export const TV_HDMI_SOURCE_NAME = 'HDMI';

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    id: 'fan',
    label: 'Fan',
    slots: [
      { id: 'power', label: 'Power', isRequired: true },
      { id: 'speed_1', label: 'Speed 1', isRequired: true },
      { id: 'speed_2', label: 'Speed 2', isRequired: true },
      { id: 'speed_3', label: 'Speed 3', isRequired: true },
      { id: 'speed_4', label: 'Speed 4', isRequired: true },
      { id: 'speed_5', label: 'Speed 5', isRequired: true },
      { id: 'speed_6', label: 'Speed 6', isRequired: true },
      { id: 'max', label: 'Max', isRequired: false },
      { id: 'speed_up', label: 'Speed +', isRequired: false },
      { id: 'speed_down', label: 'Speed −', isRequired: false },
      { id: 'led', label: 'LED', isRequired: false },
    ],
  },
  {
    id: 'tv',
    label: 'TV',
    slots: [
      { id: 'power', label: 'Power', isRequired: true },
      { id: 'home', label: 'Home', isRequired: false },
      { id: 'back', label: 'Back', isRequired: false },
      { id: 'exit', label: 'Exit', isRequired: false },
      { id: 'up', label: 'Up', isRequired: false },
      { id: 'down', label: 'Down', isRequired: false },
      { id: 'left', label: 'Left', isRequired: false },
      { id: 'right', label: 'Right', isRequired: false },
      { id: 'ok', label: 'OK', isRequired: false },
      { id: 'vol_up', label: 'Volume +', isRequired: false },
      { id: 'vol_down', label: 'Volume −', isRequired: false },
      { id: 'mute', label: 'Mute', isRequired: false },
      { id: 'play', label: 'Play', isRequired: false },
      { id: 'pause', label: 'Pause', isRequired: false },
      { id: 'input', label: 'Input', isRequired: false },
      { id: 'source_hdmi_cycle', label: 'HDMI cycle', isRequired: false },
      { id: 'source_hdmi', label: 'HDMI (last)', isRequired: false },
      { id: 'netflix', label: 'Netflix', isRequired: false },
      { id: 'youtube', label: 'YouTube', isRequired: false },
      { id: 'settings', label: 'Settings', isRequired: false },
      { id: 'picture_settings', label: 'Picture settings', isRequired: false },
      { id: 'sound_settings', label: 'Sound settings', isRequired: false },
      { id: 'memc_off', label: 'Turn off MEMC', isRequired: false },
      { id: 'brightness_min', label: 'Min brightness', isRequired: false },
      { id: 'brightness_max', label: 'Max brightness', isRequired: false },
      { id: 'wifi', label: 'Wi‑Fi', isRequired: false },
      { id: 'bluetooth', label: 'Bluetooth', isRequired: false },
    ],
  },
  {
    id: 'soundbar',
    label: 'Soundbar',
    slots: [
      { id: 'power', label: 'Power', isRequired: true },
      { id: 'vol_up', label: 'Volume +', isRequired: true },
      { id: 'vol_down', label: 'Volume −', isRequired: true },
      { id: 'mute', label: 'Mute', isRequired: false },
    ],
  },
  {
    id: 'ac',
    label: 'Air conditioner',
    slots: [
      { id: 'power', label: 'Power', isRequired: true },
      { id: 'mode_cool', label: 'Cool', isRequired: false },
      { id: 'mode_heat', label: 'Heat', isRequired: false },
      { id: 'mode_fan', label: 'Fan mode', isRequired: false },
      { id: 'mode_dry', label: 'Dry', isRequired: false },
      { id: 'temp_up', label: 'Temp +', isRequired: false },
      { id: 'temp_down', label: 'Temp −', isRequired: false },
      { id: 'fan_low', label: 'AC fan low', isRequired: false },
      { id: 'fan_medium', label: 'AC fan medium', isRequired: false },
      { id: 'fan_high', label: 'AC fan high', isRequired: false },
    ],
  },
];

export const getTemplateById = (templateId: string): DeviceTemplate => {
  const template = DEVICE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    throw new Error(`Unknown device template ${templateId}`);
  }
  return template;
};

export const isTvMediaPlayerSlotId = (slotId: string): boolean => {
  return TV_MEDIA_PLAYER_SLOT_IDS.has(slotId);
};

export const listTvButtonSlots = (): SlotDefinition[] => {
  return getTemplateById('tv').slots.filter((slot) => !isTvMediaPlayerSlotId(slot.id));
};

export const listMappedTvButtonSlots = (device: DeviceMapping): SlotDefinition[] => {
  if (device.template !== 'tv') {
    return [];
  }
  return listTvButtonSlots().filter((slot) => Boolean(device.slots[slot.id]));
};
