import type { CatalogRemote } from '../../libs/services/types';

const MAX_SPEED_TOKENS = new Set(['boost', 'max', 'maxspeed', '100', '100percent']);

const normalizeToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const sendableButtons = (remote: CatalogRemote) => {
  return remote.buttons.filter((button) => button.hasCode);
};

export const catalogDefaultLabelForFanSlot = ({
  remote,
  slotId,
}: {
  remote?: CatalogRemote;
  slotId: string;
}): string | undefined => {
  if (!remote) {
    return undefined;
  }
  const buttons = sendableButtons(remote);
  if (slotId === 'power') {
    return buttons.find((button) => normalizeToken(button.key) === 'power')?.keyName;
  }
  if (slotId === 'max' || slotId === 'speed_6') {
    const numberedMax = buttons.find((button) => /^fan_speed6$/i.test(button.key));
    if (numberedMax) {
      return numberedMax.keyName;
    }
    return buttons.find(
      (button) =>
        MAX_SPEED_TOKENS.has(normalizeToken(button.key)) ||
        MAX_SPEED_TOKENS.has(normalizeToken(button.keyName)),
    )?.keyName;
  }
  const speedMatch = /^speed_(\d+)$/.exec(slotId);
  if (speedMatch?.[1]) {
    const speedKey = new RegExp(`^fan_speed${speedMatch[1]}$`, 'i');
    return buttons.find((button) => speedKey.test(button.key))?.keyName;
  }
  if (slotId === 'speed_up') {
    return buttons.find((button) => /speed/i.test(button.keyName) && /\+/.test(button.keyName))
      ?.keyName;
  }
  if (slotId === 'speed_down') {
    return buttons.find((button) => /speed/i.test(button.keyName) && /[-−]/.test(button.keyName))
      ?.keyName;
  }
  return undefined;
};
