import { execFile } from 'node:child_process';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { promisify } from 'node:util';
import { normalizeMacAddress, parseNeighborTable } from './macAddress.js';

const execFileAsync = promisify(execFile);

const NEIGHBOR_LOOKUP_TIMEOUT_MS = 3000;
const PING_TIMEOUT_MS = 1500;
const SUBNET_SCAN_CONCURRENCY = 32;
const MIN_SCAN_PREFIX_LENGTH = 24;
const MAX_SCAN_PREFIX_LENGTH = 32;

export interface Ipv4Subnet {
  address: string;
  prefixLength: number;
  broadcast: string;
}

export const ipv4ToInt = (ip: string): number => {
  const octets = ip.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    throw new Error(`Invalid IPv4 address ${ip}`);
  }
  const [octet0, octet1, octet2, octet3] = octets;
  if (
    octet0 === undefined ||
    octet1 === undefined ||
    octet2 === undefined ||
    octet3 === undefined
  ) {
    throw new Error(`Invalid IPv4 address ${ip}`);
  }
  return ((octet0 << 24) | (octet1 << 16) | (octet2 << 8) | octet3) >>> 0;
};

export const intToIpv4 = (value: number): string => {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
};

export const prefixLengthFromNetmask = (netmask: string): number => {
  const mask = ipv4ToInt(netmask);
  const bits = mask.toString(2);
  if (!/^1*0*$/.test(bits.padStart(32, '0'))) {
    throw new Error(`Invalid IPv4 netmask ${netmask}`);
  }
  return bits.split('1').length - 1;
};

const subnetBroadcast = ({
  address,
  prefixLength,
}: {
  address: string;
  prefixLength: number;
}): string => {
  const ipInt = ipv4ToInt(address);
  const hostMask = prefixLength === 0 ? 0xffffffff : 0xffffffff >>> prefixLength;
  return intToIpv4((ipInt | hostMask) >>> 0);
};

export const hostsInSubnet = ({
  address,
  prefixLength,
}: {
  address: string;
  prefixLength: number;
}): string[] => {
  if (prefixLength < MIN_SCAN_PREFIX_LENGTH || prefixLength > MAX_SCAN_PREFIX_LENGTH) {
    return [];
  }
  const ipInt = ipv4ToInt(address);
  const hostMask = prefixLength === 0 ? 0xffffffff : 0xffffffff >>> prefixLength;
  const network = (ipInt & ~hostMask) >>> 0;
  const broadcast = (network | hostMask) >>> 0;
  const firstHost = prefixLength >= 31 ? network : network + 1;
  const lastHost = prefixLength >= 31 ? broadcast : broadcast - 1;
  const hosts: string[] = [];
  for (let hostInt = firstHost; hostInt <= lastHost; hostInt += 1) {
    const host = intToIpv4(hostInt >>> 0);
    if (host !== address) {
      hosts.push(host);
    }
  }
  return hosts;
};

const isIpv4Interface = (networkInterface: NetworkInterfaceInfo): boolean => {
  return networkInterface.family === 'IPv4';
};

export const collectIpv4Subnets = (
  interfaceByName: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): Ipv4Subnet[] => {
  const subnets: Ipv4Subnet[] = [];
  for (const networkInterface of Object.values(interfaceByName)) {
    for (const item of networkInterface ?? []) {
      if (item.internal || !isIpv4Interface(item)) {
        continue;
      }
      const prefixLength =
        item.cidr != null ? Number(item.cidr.split('/')[1]) : prefixLengthFromNetmask(item.netmask);
      if (!Number.isInteger(prefixLength)) {
        continue;
      }
      subnets.push({
        address: item.address,
        prefixLength,
        broadcast: subnetBroadcast({ address: item.address, prefixLength }),
      });
    }
  }
  return subnets;
};

const runCommand = async ({
  file,
  args,
}: {
  file: string;
  args: string[];
}): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync(file, args, {
      timeout: NEIGHBOR_LOOKUP_TIMEOUT_MS,
      encoding: 'utf8',
    });
    return stdout;
  } catch {
    return undefined;
  }
};

export const readNeighborTableOutput = async (): Promise<string> => {
  const commands: { file: string; args: string[] }[] =
    process.platform === 'linux'
      ? [
          { file: 'ip', args: ['neigh', 'show'] },
          { file: 'arp', args: ['-an'] },
        ]
      : [{ file: 'arp', args: ['-an'] }];

  const chunks: string[] = [];
  for (const command of commands) {
    const output = await runCommand(command);
    if (output) {
      chunks.push(output);
    }
  }
  return chunks.join('\n');
};

const lookupMacInNeighborTable = async (macHex: string): Promise<string | undefined> => {
  const output = await readNeighborTableOutput();
  return parseNeighborTable(output)[macHex];
};

const pingAddress = async ({
  ip,
  isBroadcast,
}: {
  ip: string;
  isBroadcast: boolean;
}): Promise<void> => {
  const args =
    process.platform === 'win32'
      ? ['-n', '1', '-w', '400', ip]
      : process.platform === 'darwin'
        ? ['-c', '1', '-W', '400', '-t', '1', ip]
        : isBroadcast
          ? ['-c', '1', '-W', '1', '-b', ip]
          : ['-c', '1', '-W', '1', ip];
  try {
    await execFileAsync('ping', args, { timeout: PING_TIMEOUT_MS, encoding: 'utf8' });
  } catch {
    // Unreachable hosts and broadcast restrictions are expected.
  }
};

const mapWithConcurrency = async ({
  items,
  concurrency,
  mapper,
}: {
  items: string[];
  concurrency: number;
  mapper: (item: string) => Promise<void>;
}): Promise<void> => {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const item = items[currentIndex];
        if (item !== undefined) {
          await mapper(item);
        }
      }
    }),
  );
};

export const lookupIpByMac = async ({
  mac,
  shouldScanSubnet = false,
}: {
  mac: string;
  shouldScanSubnet?: boolean;
}): Promise<string | undefined> => {
  const macHex = normalizeMacAddress(mac);

  const fromTable = await lookupMacInNeighborTable(macHex);
  if (fromTable) {
    return fromTable;
  }

  const subnets = collectIpv4Subnets();
  for (const subnet of subnets) {
    await pingAddress({ ip: subnet.broadcast, isBroadcast: true });
  }

  const afterBroadcast = await lookupMacInNeighborTable(macHex);
  if (afterBroadcast) {
    return afterBroadcast;
  }

  if (!shouldScanSubnet) {
    return undefined;
  }

  const hosts = subnets.flatMap((subnet) => hostsInSubnet(subnet));
  const uniqueHosts = [...new Set(hosts)];
  for (let hostIndex = 0; hostIndex < uniqueHosts.length; hostIndex += SUBNET_SCAN_CONCURRENCY) {
    const batch = uniqueHosts.slice(hostIndex, hostIndex + SUBNET_SCAN_CONCURRENCY);
    await mapWithConcurrency({
      items: batch,
      concurrency: SUBNET_SCAN_CONCURRENCY,
      mapper: async (ip) => {
        await pingAddress({ ip, isBroadcast: false });
      },
    });
    const found = await lookupMacInNeighborTable(macHex);
    if (found) {
      return found;
    }
  }

  return undefined;
};
