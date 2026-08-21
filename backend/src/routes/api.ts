import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { requireTuyaCloudConfig } from '../config.js';
import type { JsonStore } from '../store/jsonStore.js';
import { DEVICE_TEMPLATES, getTemplateById } from '../templates/deviceTemplates.js';
import { TuyaCloudClient } from '../tuya/cloudClient.js';
import { exportCatalog } from '../tuya/exportCatalog.js';
import { prepareLocalDevice } from '../tuya/localSend.js';
import { sendCatalogButton } from '../tuya/sendButton.js';
import type {
  ClimateAssumedState,
  DeviceMapping,
  FanAssumedState,
  MediaAssumedState,
} from '../types.js';
import type { MqttPublisher } from '../mqtt/mqttPublisher.js';

const defaultAssumedState = (
  templateId: DeviceMapping['template'],
): FanAssumedState | MediaAssumedState | ClimateAssumedState => {
  if (templateId === 'fan') {
    return { isOn: false, speed: 1, isLedOn: false };
  }
  if (templateId === 'ac') {
    return { isOn: false, mode: 'cool', temperatureC: 24, fanMode: 'low' };
  }
  return { isOn: false, isMuted: false };
};

const redactCatalog = async (catalog: Awaited<ReturnType<JsonStore['readCatalog']>>) => {
  if (!catalog) {
    return undefined;
  }
  return {
    ...catalog,
    local: {
      ...catalog.local,
      key: catalog.local.key ? '<redacted>' : undefined,
    },
    remotes: catalog.remotes.map((remote) => ({
      remoteId: remote.remoteId,
      remoteName: remote.remoteName,
      categoryId: remote.categoryId,
      brandId: remote.brandId,
      brandName: remote.brandName,
      remoteIndex: remote.remoteIndex,
      buttons: remote.buttons.map((button) => ({
        id: button.id,
        remoteId: button.remoteId,
        key: button.key,
        keyName: button.keyName,
        source: button.source,
        hasCode: Boolean(button.code),
      })),
    })),
  };
};

export const registerRoutes = ({
  app,
  appConfig,
  jsonStore,
  mqttPublisher,
}: {
  app: FastifyInstance;
  appConfig: AppConfig;
  jsonStore: JsonStore;
  mqttPublisher: MqttPublisher;
}): void => {
  const optionalCloudClient = (): TuyaCloudClient | undefined => {
    try {
      const tuyaConfig = requireTuyaCloudConfig(appConfig);
      return new TuyaCloudClient({
        apiEndpoint: tuyaConfig.apiEndpoint,
        accessId: tuyaConfig.accessId,
        accessSecret: tuyaConfig.accessSecret,
      });
    } catch {
      return undefined;
    }
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/templates', async () => ({ templates: DEVICE_TEMPLATES }));

  app.get('/api/catalog', async () => {
    const catalog = await jsonStore.readCatalog();
    return { catalog: (await redactCatalog(catalog)) ?? null };
  });

  app.post('/api/export', async () => {
    const tuyaConfig = requireTuyaCloudConfig(appConfig);
    const cloudClient = new TuyaCloudClient({
      apiEndpoint: tuyaConfig.apiEndpoint,
      accessId: tuyaConfig.accessId,
      accessSecret: tuyaConfig.accessSecret,
    });
    let catalog = await exportCatalog({
      cloudClient,
      infraredId: tuyaConfig.irDeviceId,
      localOverrides: {
        id: tuyaConfig.irDeviceId,
        key: appConfig.tuyaLocalKey,
        host: appConfig.tuyaLocalIp,
        mac: appConfig.tuyaLocalMac,
        version: appConfig.tuyaLocalVersion,
      },
    });
    catalog = {
      ...catalog,
      local: await prepareLocalDevice({
        localDevice: catalog.local,
        configuredIp: appConfig.tuyaLocalIp,
        configuredMac: appConfig.tuyaLocalMac,
      }),
    };
    await jsonStore.writeCatalog(catalog);
    return { catalog: await redactCatalog(catalog) };
  });

  app.post('/api/buttons/:buttonId/test-fire', async (request) => {
    const { buttonId } = request.params as { buttonId: string };
    const catalog = await jsonStore.readCatalog();
    if (!catalog) {
      throw new Error('No catalog. Run export first.');
    }
    const result = await sendCatalogButton({
      catalog,
      buttonId: decodeURIComponent(buttonId),
      cloudClient: optionalCloudClient(),
    });
    return result;
  });

  app.get('/api/mappings', async () => jsonStore.readMapping());

  app.put('/api/mappings', async (request) => {
    const body = request.body as { devices?: DeviceMapping[] };
    const devices = Array.isArray(body.devices) ? body.devices : [];
    for (const device of devices) {
      getTemplateById(device.template);
    }
    const mapping = {
      updatedAt: new Date().toISOString(),
      devices,
    };
    await jsonStore.writeMapping(mapping);
    await mqttPublisher.publishAll();
    return mapping;
  });

  app.post('/api/mappings/devices', async (request) => {
    const body = request.body as {
      id?: string;
      name?: string;
      template?: DeviceMapping['template'];
      tuyaRemoteId?: string;
      slots?: DeviceMapping['slots'];
    };
    if (!body.id || !body.name || !body.template || !body.tuyaRemoteId) {
      throw new Error('id, name, template, and tuyaRemoteId are required');
    }
    getTemplateById(body.template);
    const mapping = await jsonStore.readMapping();
    const existing = mapping.devices.find((item) => item.id === body.id);
    const device: DeviceMapping = {
      id: body.id,
      name: body.name,
      template: body.template,
      tuyaRemoteId: body.tuyaRemoteId,
      slots: body.slots ?? {},
      assumedState: existing?.assumedState ?? defaultAssumedState(body.template),
    };
    const devices = [...mapping.devices.filter((item) => item.id !== device.id), device];
    const nextMapping = { updatedAt: new Date().toISOString(), devices };
    await jsonStore.writeMapping(nextMapping);
    await mqttPublisher.publishAll();
    return nextMapping;
  });
};
