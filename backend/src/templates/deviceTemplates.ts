import type { DeviceMapping, DeviceTemplate, SlotDefinition } from '../types.js';

export const FAN_SPEED_COUNT = 6;

export const resolveMappedFanSpeedSlotId = ({
  slots,
  speed,
}: {
  slots: DeviceMapping['slots'];
  speed: number;
}): string => {
  const requestedSpeed = Math.min(FAN_SPEED_COUNT, Math.max(1, Math.round(speed)));
  for (let speedNumber = requestedSpeed; speedNumber >= 1; speedNumber -= 1) {
    const slotId = `speed_${speedNumber}`;
    if (slots[slotId]) {
      return slotId;
    }
  }
  if (slots.max) {
    return 'max';
  }
  throw new Error(`Slot speed_${requestedSpeed} is not mapped`);
};

const TV_MEDIA_PLAYER_SLOT_IDS = new Set([
  'power',
  'vol_up',
  'vol_down',
  'mute',
  'play',
  'pause',
  'source_hdmi',
]);

const SOUNDBAR_MEDIA_PLAYER_SLOT_IDS = new Set([
  'power',
  'vol_up',
  'vol_down',
  'mute',
  'next',
  'previous',
]);

export const TV_HDMI_SOURCE_NAME = 'HDMI';

export const AC_POWER_SAVING_SLOT_IDS = [
  'power_saving_40',
  'power_saving_60',
  'power_saving_80',
  'power_saving_100',
] as const;

export const AC_POWER_SAVING_OPTION_BY_SLOT_ID: Record<
  (typeof AC_POWER_SAVING_SLOT_IDS)[number],
  string
> = {
  power_saving_40: '40%',
  power_saving_60: '60%',
  power_saving_80: '80%',
  power_saving_100: '100%',
};

export const AC_BUTTON_SLOT_IDS = ['sleep', 'timer'] as const;

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
      { id: 'next', label: 'Next', isRequired: false },
      { id: 'previous', label: 'Previous', isRequired: false },
      { id: 'input', label: 'Input', isRequired: false },
      { id: 'settings', label: 'Settings', isRequired: false },
      { id: 'equalize', label: 'Equalizer', isRequired: false },
      { id: 'settings_up', label: 'Settings +', isRequired: false },
      { id: 'settings_down', label: 'Settings −', isRequired: false },
      { id: 'pair', label: 'Pair / Info', isRequired: false },
    ],
  },
  {
    id: 'ac',
    label: 'Air conditioner',
    slots: [
      { id: 'power_saving_40', label: 'Power saving 40%', isRequired: false },
      { id: 'power_saving_60', label: 'Power saving 60%', isRequired: false },
      { id: 'power_saving_80', label: 'Power saving 80%', isRequired: false },
      { id: 'power_saving_100', label: 'Power saving 100%', isRequired: false },
      { id: 'sleep', label: 'Sleep +1h', isRequired: false },
      { id: 'timer', label: 'Timer +1h', isRequired: false },
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

export const isSoundbarMediaPlayerSlotId = (slotId: string): boolean => {
  return SOUNDBAR_MEDIA_PLAYER_SLOT_IDS.has(slotId);
};

export const listSoundbarButtonSlots = (): SlotDefinition[] => {
  return getTemplateById('soundbar').slots.filter((slot) => !isSoundbarMediaPlayerSlotId(slot.id));
};

export const listMappedSoundbarButtonSlots = (device: DeviceMapping): SlotDefinition[] => {
  if (device.template !== 'soundbar') {
    return [];
  }
  return listSoundbarButtonSlots().filter((slot) => Boolean(device.slots[slot.id]));
};

export const listAcButtonSlots = (): SlotDefinition[] => {
  return getTemplateById('ac').slots.filter((slot) =>
    AC_BUTTON_SLOT_IDS.includes(slot.id as (typeof AC_BUTTON_SLOT_IDS)[number]),
  );
};

export const listAcPowerSavingSlots = (): SlotDefinition[] => {
  return getTemplateById('ac').slots.filter((slot) =>
    AC_POWER_SAVING_SLOT_IDS.includes(slot.id as (typeof AC_POWER_SAVING_SLOT_IDS)[number]),
  );
};

export const acPowerSavingSlotIdByOption = (option: string): string | undefined => {
  const entry = Object.entries(AC_POWER_SAVING_OPTION_BY_SLOT_ID).find(
    ([, label]) => label === option,
  );
  return entry?.[0];
};
