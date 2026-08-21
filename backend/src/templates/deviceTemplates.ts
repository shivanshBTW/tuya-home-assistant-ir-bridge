import type { DeviceTemplate } from '../types.js';

export const FAN_SPEED_COUNT = 6;

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
      { id: 'vol_up', label: 'Volume +', isRequired: false },
      { id: 'vol_down', label: 'Volume −', isRequired: false },
      { id: 'mute', label: 'Mute', isRequired: false },
      { id: 'play', label: 'Play', isRequired: false },
      { id: 'pause', label: 'Pause', isRequired: false },
      { id: 'source_hdmi1', label: 'HDMI 1', isRequired: false },
      { id: 'source_hdmi2', label: 'HDMI 2', isRequired: false },
      { id: 'up', label: 'Up', isRequired: false },
      { id: 'down', label: 'Down', isRequired: false },
      { id: 'left', label: 'Left', isRequired: false },
      { id: 'right', label: 'Right', isRequired: false },
      { id: 'ok', label: 'OK', isRequired: false },
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
