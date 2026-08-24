import type { LocalDevice } from '../types.js';
import { bitsToPulses, parseIrBitString, pulsesToHex } from '../tuya/irDecode.js';
import { catalogCodeToLocalIrFrame } from '../tuya/irFrame.js';
import { sendLocalIrCode } from '../tuya/localSend.js';

export const sendTrainerIrBits = async ({
  bits,
  localDevice,
}: {
  bits: string;
  localDevice: LocalDevice;
}): Promise<{ bitCount: number; pulseCount: number }> => {
  const compactBits = parseIrBitString(bits);
  const pulses = bitsToPulses(compactBits);
  await sendLocalIrCode({
    localDevice,
    frame: catalogCodeToLocalIrFrame(pulsesToHex(pulses)),
  });
  return {
    bitCount: compactBits.length,
    pulseCount: pulses.length,
  };
};
