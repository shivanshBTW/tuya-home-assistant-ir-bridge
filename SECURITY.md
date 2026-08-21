# Security policy

## Reporting

Please report vulnerabilities privately (GitHub Security Advisories on this repository, or email the maintainer). Do not open public issues that include secrets.

## Do not paste

- Tuya Access ID / Access Secret
- Device `localKey`
- Learned IR `code` payloads
- MQTT passwords, `API_TOKEN`, Home Assistant long-lived tokens
- Full `data/catalog.json` or `data/mapping.json`

## Public repo

This project is meant to be public. Runtime dumps under `data/` are gitignored because they contain `localKey` and IR codes. Example JSON under `examples/` is redacted.
