# Tuya Home Assistant IR Bridge

Map **trained Tuya IR buttons** onto real Home Assistant devices (`fan`, `light`, `media_player`, `climate`) so Google Home gets Fan / TV / Speaker / Thermostat APIs.

Tuya’s names, order, and “fan/TV” layout are **not trusted**. You test-fire each button in the web mapper and drop it into a fixed HA slot.

License: [GNU GPL v3](LICENSE).

## Architecture

- **backend/** — Fastify: Tuya Cloud export, LAN send (`nodetuya`), MQTT discovery
- **frontend/** — Vite + React 19 mapper (MUI v9, light/dark)
- Home Assistant Container on the **same machine** talks MQTT (and optionally REST) to this bridge
- IR blaster is a **Wi-Fi** Tuya device on the LAN

Local send is used when a button has a raw `code`. Database remotes with only a key name fall back to Tuya Cloud.

## Requirements

- Node 24 LTS (`nvm use` reads `.nvmrc`)
- pnpm (Corepack: `corepack enable`)
- Tuya IoT Cloud project with **IR Control Hub Open Service** enabled
- Optional: MQTT broker Home Assistant already uses (do not run a second broker)

## Setup

```bash
nvm use
pnpm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env`:

- `API_TOKEN` — long random string (required; the example placeholder is rejected)
- Tuya Cloud: `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_API_ENDPOINT`, `TUYA_IR_DEVICE_ID`
- LAN: `TUYA_LOCAL_IP` if you know it; otherwise `TUYA_LOCAL_MAC` to find the IP on the LAN; `TUYA_LOCAL_KEY` if not fetched during export
- `MQTT_URL` if Home Assistant should auto-create entities

Tuya OpenAPI regions (no project id in this repo):

- `https://openapi.tuyaus.com`
- `https://openapi.tuyaeu.com`
- `https://openapi.tuyacn.com`
- `https://openapi.tuyain.com`

### Export catalog

```bash
pnpm export
```

Writes gitignored `data/catalog.json` (contains `localKey` and IR payloads — never commit it).

### Run

```bash
pnpm dev
```

- Mapper UI: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

In **Settings**, paste `API_TOKEN`, export (or use `pnpm export`), then on **Mapper** assign buttons to Fan speeds 1–6 and LED. Leftover keys stay on **Keypad** and are not sent to Google.

### Docker (same host as HA Container)

```bash
docker compose up -d --build
```

Uses `network_mode: host` so Tuya UDP discovery and TCP 6668 work. Point HA MQTT at the same broker as `MQTT_URL`.

## Google Home

Expose the MQTT `fan` / `light` / `media_player` / `climate` entities (Nabu Casa or Google Assistant integration). Then: `Hey Google, sync my devices`.

See [homeassistant/packages/google_and_universal.yaml.example](homeassistant/packages/google_and_universal.yaml.example) for a TV+soundbar Universal Media Player sketch.

Do **not** expose Tuya’s own remotes.

## Secrets

Never commit `.env`, `data/catalog.json`, or `data/mapping.json`. See `.env.example` files and [SECURITY.md](SECURITY.md).
