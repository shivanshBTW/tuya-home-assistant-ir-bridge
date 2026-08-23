import type { FastifyInstance } from 'fastify';
import { SEND_PATH_LOCAL, STUDY_LISTEN_TIMEOUT_MS, STUDY_ROUTE_TIMEOUT_MS } from '../constants.js';
import type { AppConfig } from '../config.js';
import { requireTuyaCloudConfig } from '../config.js';
import type { JsonStore } from '../store/jsonStore.js';
import { DEVICE_TEMPLATES, getTemplateById } from '../templates/deviceTemplates.js';
import { TuyaCloudClient } from '../tuya/cloudClient.js';
import { exportCatalog } from '../tuya/exportCatalog.js';
import { listCatalogRemoteBits } from '../tuya/catalogRemoteBits.js';
import {
  bitsToPulses,
  compareIrBits,
  compareIrPulses,
  decodeIrCode,
  parseIrBitString,
  pulsesToHex,
} from '../tuya/irDecode.js';
import { catalogCodeToLocalIrFrame } from '../tuya/irFrame.js';
import { prepareLocalDevice, resolveLocalBlaster, sendLocalIrCode } from '../tuya/localSend.js';
import { generateTrainerGrid } from '../trainer/trainerGenerate.js';
import { inferTrainerFields } from '../trainer/trainerInfer.js';
import { assertTrainerSchema, TRAINER_DEVICE_REMOTE_ID } from '../trainer/trainerPlan.js';
import { toTrainerResponse } from '../trainer/trainerResponse.js';
import { upsertTrainerSample } from '../trainer/trainerSamples.js';
import { decodeTrainerText } from '../trainer/trainerText.js';
import { sendTrainerIrBits } from '../trainer/trainerIrSend.js';
import { listenForLocalIrCode } from '../tuya/localStudy.js';
import { resolveTuyaLocalHost } from '../tuya/resolveLocalHost.js';
import { sendCatalogButton } from '../tuya/sendButton.js';
import type {
  ClimateAssumedState,
  DeviceMapping,
  FanAssumedState,
  MediaAssumedState,
  StudyCapture,
  StudyFile,
  TrainerSample,
  TrainerSchema,
} from '../types.js';
import type { MqttPublisher } from '../mqtt/mqttPublisher.js';

const toStudyResponse = (study: StudyFile) => {
  return {
    updatedAt: study.updatedAt,
    log: study.log.map((capture) => ({
      ...capture,
      decode: decodeIrCode(capture.code),
    })),
    savedButtons: study.savedButtons,
  };
};

const defaultAssumedState = ({
  templateId,
  irSource,
}: {
  templateId: DeviceMapping['template'];
  irSource?: DeviceMapping['irSource'];
}): FanAssumedState | MediaAssumedState | ClimateAssumedState => {
  if (templateId === 'fan') {
    return { isOn: false, speed: 1, isLedOn: false };
  }
  if (templateId === 'ac') {
    return {
      isOn: false,
      mode: 'cool',
      temperatureC: 24,
      fanMode: irSource === 'trainer' ? 'medium' : 'low',
    };
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
  let cloudClient: TuyaCloudClient | undefined;
  let hasResolvedCloudClient = false;
  const optionalCloudClient = (): TuyaCloudClient | undefined => {
    if (hasResolvedCloudClient) {
      return cloudClient;
    }
    hasResolvedCloudClient = true;
    try {
      const tuyaConfig = requireTuyaCloudConfig(appConfig);
      cloudClient = new TuyaCloudClient({
        apiEndpoint: tuyaConfig.apiEndpoint,
        accessId: tuyaConfig.accessId,
        accessSecret: tuyaConfig.accessSecret,
      });
    } catch {
      cloudClient = undefined;
    }
    return cloudClient;
  };

  let isStudyListenInProgress = false;

  const requireLocalBlaster = async () => {
    const catalog = await jsonStore.readCatalog();
    if (!catalog?.local.key) {
      throw new Error('No catalog local key. Run export first.');
    }
    const localDevice = await resolveLocalBlaster({
      localDevice: catalog.local,
      configuredIp: appConfig.tuyaLocalIp,
      configuredMac: appConfig.tuyaLocalMac,
    });
    if (!localDevice?.host) {
      throw new Error('IR blaster LAN host was not found');
    }
    return localDevice;
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/local-host', async (request) => {
    const catalog = await jsonStore.readCatalog();
    const deviceId = catalog?.local.id ?? appConfig.tuyaIrDeviceId;
    if (!deviceId) {
      return { host: undefined, hasLocalKey: false };
    }
    const query = request.query as { scan?: string };
    const resolved = await resolveTuyaLocalHost({
      configuredIp: appConfig.tuyaLocalIp,
      configuredMac: appConfig.tuyaLocalMac,
      fallbackHost: catalog?.local.host,
      deviceId,
      shouldScanSubnet: query.scan === '1',
    });
    return {
      host: resolved.host,
      hasLocalKey: Boolean(catalog?.local.key || appConfig.tuyaLocalKey),
    };
  });

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
      configuredIp: appConfig.tuyaLocalIp,
      configuredMac: appConfig.tuyaLocalMac,
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
      irSource?: DeviceMapping['irSource'];
      slots?: DeviceMapping['slots'];
    };
    const isTrainerDevice =
      body.irSource === 'trainer' || body.tuyaRemoteId === TRAINER_DEVICE_REMOTE_ID;
    const tuyaRemoteId = isTrainerDevice ? TRAINER_DEVICE_REMOTE_ID : body.tuyaRemoteId;
    const irSource = isTrainerDevice ? 'trainer' : (body.irSource ?? 'catalog');
    if (!body.id || !body.name || !body.template || !tuyaRemoteId) {
      throw new Error(
        isTrainerDevice
          ? 'id, name, and template are required'
          : 'id, name, template, and tuyaRemoteId are required',
      );
    }
    getTemplateById(body.template);
    const mapping = await jsonStore.readMapping();
    const existing = mapping.devices.find((item) => item.id === body.id);
    const device: DeviceMapping = {
      id: body.id,
      name: body.name,
      template: body.template,
      tuyaRemoteId,
      irSource,
      slots: body.slots ?? {},
      assumedState:
        existing?.assumedState ?? defaultAssumedState({ templateId: body.template, irSource }),
    };
    const devices = [...mapping.devices.filter((item) => item.id !== device.id), device];
    const nextMapping = { updatedAt: new Date().toISOString(), devices };
    await jsonStore.writeMapping(nextMapping);
    await mqttPublisher.publishAll();
    return nextMapping;
  });

  app.get('/api/study/remote-bits', async (request) => {
    const catalog = await jsonStore.readCatalog();
    if (!catalog) {
      throw new Error('No catalog. Run export first.');
    }
    const query = request.query as { remoteId?: string };
    return listCatalogRemoteBits({
      catalog,
      remoteId: query.remoteId,
    });
  });

  app.get('/api/study', async () => toStudyResponse(await jsonStore.readStudy()));

  app.post('/api/study/listen', async (request) => {
    request.raw.setTimeout(STUDY_ROUTE_TIMEOUT_MS);
    if (isStudyListenInProgress) {
      throw new Error('Study listen is already running');
    }
    isStudyListenInProgress = true;
    try {
      const localDevice = await requireLocalBlaster();
      const code = await listenForLocalIrCode({
        localDevice,
        timeoutMs: STUDY_LISTEN_TIMEOUT_MS,
      });
      const decode = decodeIrCode(code);
      const capture: StudyCapture = {
        id: crypto.randomUUID(),
        receivedAt: new Date().toISOString(),
        code,
        kind: decode.kind,
        pulseCount: decode.pulseCount,
      };
      const study = await jsonStore.readStudy();
      study.log.push(capture);
      await jsonStore.writeStudy(study);
      console.log(`Study captured ${capture.id} pulses=${capture.pulseCount} kind=${capture.kind}`);
      return {
        capture: { ...capture, decode },
        study: toStudyResponse(await jsonStore.readStudy()),
      };
    } finally {
      isStudyListenInProgress = false;
    }
  });

  app.post('/api/study/buttons', async (request) => {
    const body = request.body as { captureId?: string; label?: string; notes?: string };
    const captureId = body.captureId?.trim();
    const label = body.label?.trim();
    if (!captureId || !label) {
      throw new Error('captureId and label are required');
    }
    const study = await jsonStore.readStudy();
    const capture = study.log.find((item) => item.id === captureId);
    if (!capture) {
      throw new Error(`Unknown capture ${captureId}`);
    }
    const existing = study.savedButtons.find((item) => item.captureId === captureId);
    const savedButton = {
      id: existing?.id ?? crypto.randomUUID(),
      captureId,
      label,
      ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
    };
    study.savedButtons = [
      ...study.savedButtons.filter((item) => item.captureId !== captureId),
      savedButton,
    ];
    await jsonStore.writeStudy(study);
    return toStudyResponse(await jsonStore.readStudy());
  });

  app.post('/api/study/replay/:captureId', async (request) => {
    if (isStudyListenInProgress) {
      throw new Error('Wait for study listen to finish before replay');
    }
    const { captureId } = request.params as { captureId: string };
    const study = await jsonStore.readStudy();
    const capture = study.log.find((item) => item.id === decodeURIComponent(captureId));
    if (!capture) {
      throw new Error(`Unknown capture ${captureId}`);
    }
    const localDevice = await requireLocalBlaster();
    await sendLocalIrCode({
      localDevice,
      frame: catalogCodeToLocalIrFrame(capture.code),
    });
    console.log(`Study replayed ${capture.id} to ${localDevice.host}`);
    return { path: SEND_PATH_LOCAL, captureId: capture.id };
  });

  app.post('/api/study/fire-bits', async (request) => {
    if (isStudyListenInProgress) {
      throw new Error('Wait for study listen to finish before firing bits');
    }
    const body = request.body as { bits?: string };
    if (typeof body.bits !== 'string') {
      throw new Error('bits is required');
    }
    const compactBits = parseIrBitString(body.bits);
    const pulses = bitsToPulses(compactBits);
    const localDevice = await requireLocalBlaster();
    await sendLocalIrCode({
      localDevice,
      frame: catalogCodeToLocalIrFrame(pulsesToHex(pulses)),
    });
    console.log(
      `Study fired ${compactBits.length} bits (${pulses.length} pulses) to ${localDevice.host}`,
    );
    return {
      path: SEND_PATH_LOCAL,
      bitCount: compactBits.length,
      pulseCount: pulses.length,
    };
  });

  app.get('/api/study/diff', async (request) => {
    const query = request.query as { left?: string; right?: string };
    if (!query.left || !query.right) {
      throw new Error('left and right capture ids are required');
    }
    const study = await jsonStore.readStudy();
    const leftCapture = study.log.find((item) => item.id === query.left);
    const rightCapture = study.log.find((item) => item.id === query.right);
    if (!leftCapture || !rightCapture) {
      throw new Error('Both captures must exist in the study log');
    }
    const left = decodeIrCode(leftCapture.code);
    const right = decodeIrCode(rightCapture.code);
    return {
      left: { ...leftCapture, decode: left },
      right: { ...rightCapture, decode: right },
      diffs: compareIrPulses({ left: left.pulses, right: right.pulses }),
      bitDiffs: compareIrBits({ left: left.bits, right: right.bits }),
    };
  });

  const readSampleLabel = (
    body: Record<string, unknown>,
  ): Pick<TrainerSample, 'paramValues' | 'unlockedParamId' | 'probeParamId' | 'probeIndex'> => {
    if (!body.paramValues || typeof body.paramValues !== 'object' || Array.isArray(body.paramValues)) {
      throw new Error('paramValues is required');
    }
    const unlockedParamId =
      typeof body.unlockedParamId === 'string' ? body.unlockedParamId.trim() : '';
    if (!unlockedParamId) {
      throw new Error('unlockedParamId is required');
    }
    const paramValues = Object.fromEntries(
      Object.entries(body.paramValues as Record<string, unknown>).flatMap(([paramId, optionId]) =>
        typeof optionId === 'string' ? [[paramId, optionId]] : [],
      ),
    );
    const probeParamId =
      typeof body.probeParamId === 'string' && body.probeParamId.trim() !== ''
        ? body.probeParamId.trim()
        : undefined;
    const probeIndex = typeof body.probeIndex === 'number' ? body.probeIndex : undefined;
    return {
      paramValues,
      unlockedParamId,
      ...(probeParamId ? { probeParamId } : {}),
      ...(probeIndex === undefined ? {} : { probeIndex }),
    };
  };

  app.get('/api/trainer', async () => toTrainerResponse(await jsonStore.readTrainer()));

  app.put('/api/trainer', async (request) => {
    const body = request.body as { schema?: TrainerSchema };
    if (!body.schema) {
      throw new Error('schema is required');
    }
    const schema = assertTrainerSchema(body.schema);
    const trainer = await jsonStore.readTrainer();
    await jsonStore.writeTrainer({
      ...trainer,
      schema,
      inference: undefined,
      generation: undefined,
    });
    return toTrainerResponse(await jsonStore.readTrainer());
  });

  app.post('/api/trainer/listen', async (request) => {
    request.raw.setTimeout(STUDY_ROUTE_TIMEOUT_MS);
    if (isStudyListenInProgress) {
      throw new Error('Study listen is already running');
    }
    const label = readSampleLabel((request.body ?? {}) as Record<string, unknown>);
    isStudyListenInProgress = true;
    try {
      const localDevice = await requireLocalBlaster();
      const code = await listenForLocalIrCode({
        localDevice,
        timeoutMs: STUDY_LISTEN_TIMEOUT_MS,
      });
      const decode = decodeIrCode(code);
      if (!decode.bits || decode.bits.includes('?')) {
        throw new Error('Learned frame did not decode to usable 0/1 bits');
      }
      const sample: TrainerSample = {
        id: crypto.randomUUID(),
        receivedAt: new Date().toISOString(),
        source: 'remote',
        ...label,
        code,
        kind: decode.kind,
        pulseCount: decode.pulseCount,
        bits: decode.bits,
      };
      const trainer = upsertTrainerSample({
        trainer: await jsonStore.readTrainer(),
        sample,
      });
      trainer.inference = inferTrainerFields(trainer);
      trainer.generation = generateTrainerGrid(trainer);
      await jsonStore.writeTrainer(trainer);
      return toTrainerResponse(await jsonStore.readTrainer());
    } finally {
      isStudyListenInProgress = false;
    }
  });

  app.post('/api/trainer/samples', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const label = readSampleLabel(body);
    if (typeof body.text !== 'string') {
      throw new Error('text is required');
    }
    const decoded = decodeTrainerText(body.text);
    const sample: TrainerSample = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      source: 'text',
      ...label,
      code: decoded.code,
      kind: decoded.kind,
      pulseCount: decoded.pulseCount,
      bits: decoded.bits,
    };
    const trainer = upsertTrainerSample({
      trainer: await jsonStore.readTrainer(),
      sample,
    });
    trainer.inference = inferTrainerFields(trainer);
    trainer.generation = generateTrainerGrid(trainer);
    await jsonStore.writeTrainer(trainer);
    return toTrainerResponse(await jsonStore.readTrainer());
  });

  app.post('/api/trainer/infer', async () => {
    const trainer = await jsonStore.readTrainer();
    trainer.inference = inferTrainerFields(trainer);
    trainer.generation = generateTrainerGrid(trainer);
    await jsonStore.writeTrainer(trainer);
    return toTrainerResponse(await jsonStore.readTrainer());
  });

  app.post('/api/trainer/generate', async () => {
    const trainer = await jsonStore.readTrainer();
    trainer.inference = inferTrainerFields(trainer);
    trainer.generation = generateTrainerGrid(trainer);
    await jsonStore.writeTrainer(trainer);
    return toTrainerResponse(await jsonStore.readTrainer());
  });

  app.post('/api/trainer/fire', async (request) => {
    if (isStudyListenInProgress) {
      throw new Error('Wait for study listen to finish before firing bits');
    }
    const body = (request.body ?? {}) as { bits?: string; cellId?: string };
    const trainer = await jsonStore.readTrainer();
    const generation = trainer.inference ? generateTrainerGrid(trainer) : trainer.generation;
    const cellBits =
      typeof body.cellId === 'string'
        ? generation?.cells.find((cell) => cell.id === body.cellId)?.bits
        : undefined;
    const rawBits = typeof body.bits === 'string' ? body.bits : cellBits;
    if (!rawBits) {
      throw new Error('bits or a generated cellId is required');
    }
    const localDevice = await requireLocalBlaster();
    const sendResult = await sendTrainerIrBits({ bits: rawBits, localDevice });
    console.log(
      `Trainer fired ${sendResult.bitCount} bits (${sendResult.pulseCount} pulses) to ${localDevice.host}`,
    );
    return {
      path: SEND_PATH_LOCAL,
      ...sendResult,
    };
  });
};
