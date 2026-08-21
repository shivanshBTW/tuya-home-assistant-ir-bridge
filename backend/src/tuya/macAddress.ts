const MAC_HEX_LENGTH = 12;

export const normalizeMacAddress = (mac: string): string => {
  const hex = mac
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (hex.length !== MAC_HEX_LENGTH) {
    throw new Error(`Invalid MAC address "${mac}". Use aa:bb:cc:dd:ee:ff`);
  }
  return hex;
};

export const formatMacAddress = (mac: string): string => {
  const hex = normalizeMacAddress(mac);
  const octets = hex.match(/.{2}/g);
  if (!octets || octets.length !== 6) {
    throw new Error(`Invalid MAC address "${mac}". Use aa:bb:cc:dd:ee:ff`);
  }
  return octets.join(':');
};

const IPV4_PATTERN = String.raw`(\d{1,3}(?:\.\d{1,3}){3})`;
const MAC_TOKEN_PATTERN = String.raw`([0-9a-fA-F]{2}(?:[:\-.][0-9a-fA-F]{2}){5}|[0-9a-fA-F]{12})`;

const ARP_PAREN_PATTERN = new RegExp(
  String.raw`\(${IPV4_PATTERN}\)\s+at\s+${MAC_TOKEN_PATTERN}`,
  'g',
);
const IP_NEIGH_PATTERN = new RegExp(
  String.raw`^${IPV4_PATTERN}\s+dev\s+\S+\s+lladdr\s+${MAC_TOKEN_PATTERN}`,
  'gm',
);
const WINDOWS_ARP_PATTERN = new RegExp(String.raw`${IPV4_PATTERN}\s+${MAC_TOKEN_PATTERN}\s+`, 'g');

const addIpByMac = ({
  ipByMac,
  ip,
  mac,
}: {
  ipByMac: Record<string, string>;
  ip: string;
  mac: string;
}): void => {
  if (mac.toLowerCase() === 'incomplete') {
    return;
  }
  try {
    ipByMac[normalizeMacAddress(mac)] = ip;
  } catch {
    // Ignore unparseable hardware addresses such as "(incomplete)".
  }
};

export const parseNeighborTable = (output: string): Record<string, string> => {
  const ipByMac: Record<string, string> = {};

  for (const match of output.matchAll(ARP_PAREN_PATTERN)) {
    const ip = match[1];
    const mac = match[2];
    if (ip && mac) {
      addIpByMac({ ipByMac, ip, mac });
    }
  }

  for (const match of output.matchAll(IP_NEIGH_PATTERN)) {
    const ip = match[1];
    const mac = match[2];
    if (ip && mac) {
      addIpByMac({ ipByMac, ip, mac });
    }
  }

  for (const match of output.matchAll(WINDOWS_ARP_PATTERN)) {
    const ip = match[1];
    const mac = match[2];
    if (ip && mac) {
      addIpByMac({ ipByMac, ip, mac });
    }
  }

  return ipByMac;
};
