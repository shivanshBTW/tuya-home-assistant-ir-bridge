export const isLanIpv4 = (host: string): boolean => {
  const octets = host.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [octet0, octet1] = octets;
  if (octet0 === undefined || octet1 === undefined) {
    return false;
  }
  if (octet0 === 10) {
    return true;
  }
  if (octet0 === 192 && octet1 === 168) {
    return true;
  }
  if (octet0 === 172 && octet1 >= 16 && octet1 <= 31) {
    return true;
  }
  return false;
};
