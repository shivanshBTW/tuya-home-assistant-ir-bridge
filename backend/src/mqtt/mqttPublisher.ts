import mqtt from 'mqtt';
import type { AppConfig } from '../config.js';
import {
  catalogFanButtonSlug,
  catalogFanSpeedRangeMax,
  findCatalogFanExtraButton,
  listCatalogFanExtraButtons,
  normalizeRequestedFanSpeed,
  resolveFanPowerButtonToSend,
  resolveFanSpeedButtonToSend,
} from '../templates/catalogFan.js';
import {
  FAN_SPEED_COUNT,
  TV_HDMI_SOURCE_NAME,
  AC_POWER_SAVING_OPTION_BY_SLOT_ID,
  AC_POWER_SAVING_SLOT_IDS,
  acPowerSavingSlotIdByOption,
  listAcButtonSlots,
  listAcPowerSavingSlots,
  listSoundbarButtonSlots,
  listTvButtonSlots,
} from '../templates/deviceTemplates.js';
import { RATE_LIMIT_DELAY_MS } from '../constants.js';
import {
  isAcHvacMode,
  listAcClimateButtonsToSend,
  normalizeAcHvacMode,
  publishedAcFanMode,
} from '../templates/acCommand.js';
import {
  acClimateDiscoveryPayload,
  applyClimateMqttBurst,
  CLIMATE_COMMAND_COALESCE_MS,
  climateCommandKindFromTopic,
  rememberedAcTemperatureC,
  type ClimateMqttCommand,
} from './climateMqtt.js';
import type {
  Catalog,
  ClimateAssumedState,
  DeviceMapping,
  FanAssumedState,
  MappingFile,
  MediaAssumedState,
  SlotDefinition,
  TrainerFile,
} from '../types.js';
import { sendCatalogButton } from '../tuya/sendButton.js';
import { resolveLocalBlaster } from '../tuya/localSend.js';
import type { TuyaCloudClient } from '../tuya/cloudClient.js';
import type { JsonStore } from '../store/jsonStore.js';
import {
  TRAINER_POWER_SAVING_HA_OPTIONS,
  isTrainerBackedDevice,
  listTrainerClimatePackets,
  listTrainerPowerSavingPackets,
  trainerPowerSavingHaLabel,
  trainerPowerSavingOptionIdFromHa,
} from '../trainer/trainerClimate.js';
import { sendTrainerIrBits } from '../trainer/trainerIrSend.js';

const BRIDGE_ID = 'tuya_ha_ir_bridge';

const topic = (prefix: string, parts: string[]): string => `${prefix}/${parts.join('/')}`;

export const mqttDeviceIdFromTopic = (messageTopic: string): string | undefined => {
  const parts = messageTopic.split('/');
  const bridgeIndex = parts.indexOf(BRIDGE_ID);
  if (bridgeIndex === -1) {
    return undefined;
  }
  return parts[bridgeIndex + 1];
};

export const isMqttCommandTopic = (messageTopic: string): boolean => {
  return (
    messageTopic.endsWith('/set') ||
    messageTopic.endsWith('/volume_up') ||
    messageTopic.endsWith('/volume_down')
  );
};

const buttonSlugFromTopic = (messageTopic: string): string | undefined => {
  const match = /\/button\/([^/]+)\/set$/.exec(messageTopic);
  return match?.[1];
};

const asFanState = (value: DeviceMapping['assumedState']): FanAssumedState => {
  const state = value as FanAssumedState;
  return {
    isOn: Boolean(state.isOn),
    speed: Number(state.speed ?? 1),
    isLedOn: Boolean(state.isLedOn),
  };
};

const asMediaState = (value: DeviceMapping['assumedState']): MediaAssumedState => {
  const state = value as MediaAssumedState;
  return {
    isOn: Boolean(state.isOn),
    isMuted: Boolean(state.isMuted),
    source: state.source,
  };
};

const asClimateState = (value: DeviceMapping['assumedState']): ClimateAssumedState => {
  const state = value as ClimateAssumedState;
  return {
    isOn: Boolean(state.isOn),
    mode: state.mode,
    temperatureC: state.temperatureC,
    fanMode: state.fanMode,
    powerSaving: state.powerSaving,
  };
};

export class MqttPublisher {
  private client: mqtt.MqttClient | undefined;
  private readonly commandTailByDeviceId = new Map<string, Promise<void>>();
  private readonly climateBurstByDeviceId = new Map<string, ClimateMqttCommand[]>();
  private readonly climateFlushScheduledByDeviceId = new Set<string>();

  constructor(
    private readonly appConfig: AppConfig,
    private readonly jsonStore: JsonStore,
    private readonly getCloudClient: () => TuyaCloudClient | undefined,
  ) {}

  async start(): Promise<void> {
    if (!this.appConfig.mqttUrl) {
      console.warn('MQTT_URL is not set; Home Assistant discovery is disabled.');
      return;
    }

    this.client = mqtt.connect(this.appConfig.mqttUrl, {
      username: this.appConfig.mqttUsername,
      password: this.appConfig.mqttPassword,
    });

    await new Promise<void>((resolve, reject) => {
      this.client?.on('connect', () => resolve());
      this.client?.on('error', (error) => reject(error));
    });

    this.client.on('message', (messageTopic, payload) => {
      if (!isMqttCommandTopic(messageTopic)) {
        return;
      }
      const deviceId = mqttDeviceIdFromTopic(messageTopic);
      if (!deviceId) {
        return;
      }
      const climateKind = climateCommandKindFromTopic(messageTopic);
      if (climateKind) {
        console.log(`MQTT climate command ${deviceId} ${climateKind}=${payload.toString()}`);
        this.enqueueClimateCommand({
          deviceId,
          command: { kind: climateKind, payload: payload.toString() },
        });
        return;
      }
      console.log(`MQTT command ${deviceId} ${messageTopic} ${payload.toString()}`);
      void this.enqueueDeviceCommand({
        deviceId,
        run: () => this.handleCommand({ messageTopic, payload: payload.toString() }),
      });
    });

    await this.client.subscribe(`${this.appConfig.mqttDiscoveryPrefix}/${BRIDGE_ID}/#`);
    await this.publishAll();
    console.log('MQTT discovery published');
  }

  private enqueueDeviceCommand({
    deviceId,
    run,
  }: {
    deviceId: string;
    run: () => Promise<void>;
  }): Promise<void> {
    const previous = this.commandTailByDeviceId.get(deviceId) ?? Promise.resolve();
    const next = previous.then(run, run);
    this.commandTailByDeviceId.set(
      deviceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private enqueueClimateCommand({
    deviceId,
    command,
  }: {
    deviceId: string;
    command: ClimateMqttCommand;
  }): void {
    const burst = this.climateBurstByDeviceId.get(deviceId) ?? [];
    burst.push(command);
    this.climateBurstByDeviceId.set(deviceId, burst);
    if (this.climateFlushScheduledByDeviceId.has(deviceId)) {
      return;
    }
    this.climateFlushScheduledByDeviceId.add(deviceId);
    void this.enqueueDeviceCommand({
      deviceId,
      run: async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, CLIMATE_COMMAND_COALESCE_MS);
        });
        this.climateFlushScheduledByDeviceId.delete(deviceId);
        const commands = this.climateBurstByDeviceId.get(deviceId) ?? [];
        this.climateBurstByDeviceId.delete(deviceId);
        if (commands.length === 0) {
          return;
        }
        await this.handleClimateBurst({ deviceId, commands });
      },
    });
  }

  async publishAll(): Promise<void> {
    if (!this.client) {
      return;
    }
    const mapping = await this.jsonStore.readMapping();
    for (const device of mapping.devices) {
      await this.publishDevice(device);
    }
  }

  private async publishDevice(device: DeviceMapping): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];

    if (device.template === 'fan') {
      const catalog = await this.jsonStore.readCatalog();
      const speedRangeMax = catalog
        ? catalogFanSpeedRangeMax({ catalog, remoteId: device.tuyaRemoteId })
        : FAN_SPEED_COUNT;
      const commandTopic = topic(prefix, [...base, 'fan', 'set']);
      const percentageCommandTopic = topic(prefix, [...base, 'fan', 'percentage', 'set']);
      await this.client.publish(
        topic(prefix, ['fan', BRIDGE_ID, device.id, 'config']),
        JSON.stringify({
          name: device.name,
          unique_id: `${BRIDGE_ID}_${device.id}_fan`,
          command_topic: commandTopic,
          state_topic: topic(prefix, [...base, 'fan', 'state']),
          percentage_command_topic: percentageCommandTopic,
          percentage_state_topic: topic(prefix, [...base, 'fan', 'percentage']),
          speed_range_min: 1,
          speed_range_max: speedRangeMax,
          payload_on: 'ON',
          payload_off: 'OFF',
          optimistic: true,
          device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
      await this.client.subscribe(percentageCommandTopic);
      await this.publishFanState(device);

      if (catalog) {
        await this.publishCatalogFanExtraButtons({ device, catalog });
      }

      if (device.slots.led) {
        const ledCommandTopic = topic(prefix, [...base, 'led', 'set']);
        await this.client.publish(
          topic(prefix, ['light', BRIDGE_ID, `${device.id}_led`, 'config']),
          JSON.stringify({
            name: `${device.name} LED`,
            unique_id: `${BRIDGE_ID}_${device.id}_led`,
            command_topic: ledCommandTopic,
            state_topic: topic(prefix, [...base, 'led', 'state']),
            payload_on: 'ON',
            payload_off: 'OFF',
            optimistic: true,
            device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
          }),
          { retain: true },
        );
        await this.client.subscribe(ledCommandTopic);
      }
      return;
    }

    if (device.template === 'tv' || device.template === 'soundbar') {
      const mediaState = asMediaState(device.assumedState);
      const commandTopic = topic(prefix, [...base, 'media', 'set']);
      const volumeUpTopic = topic(prefix, [...base, 'media', 'volume_up']);
      const volumeDownTopic = topic(prefix, [...base, 'media', 'volume_down']);
      const sourceCommandTopic = topic(prefix, [...base, 'media', 'source', 'set']);
      const deviceClass = device.template === 'tv' ? 'tv' : 'speaker';
      const hasHdmiSource = device.template === 'tv' && Boolean(device.slots.source_hdmi);
      const hasNextTrack = Boolean(device.slots.next);
      const hasPreviousTrack = Boolean(device.slots.previous);
      await this.client.publish(
        topic(prefix, ['media_player', BRIDGE_ID, device.id, 'config']),
        JSON.stringify({
          name: device.name,
          unique_id: `${BRIDGE_ID}_${device.id}_media`,
          command_topic: commandTopic,
          state_topic: topic(prefix, [...base, 'media', 'state']),
          device_class: deviceClass,
          payload_play: 'PLAY',
          payload_pause: 'PAUSE',
          payload_stop: 'STOP',
          volume_up_command_topic: volumeUpTopic,
          volume_down_command_topic: volumeDownTopic,
          ...(hasNextTrack ? { payload_next: 'NEXT' } : {}),
          ...(hasPreviousTrack ? { payload_previous: 'PREVIOUS' } : {}),
          ...(hasHdmiSource
            ? {
                source_list: [TV_HDMI_SOURCE_NAME],
                source_command_topic: sourceCommandTopic,
              }
            : {}),
          device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
      await this.client.subscribe(volumeUpTopic);
      await this.client.subscribe(volumeDownTopic);
      if (hasHdmiSource) {
        await this.client.subscribe(sourceCommandTopic);
      }
      await this.client.publish(
        topic(prefix, [...base, 'media', 'state']),
        mediaState.isOn ? 'ON' : 'OFF',
        { retain: true },
      );

      if (device.template === 'tv') {
        await this.publishMappedButtonEntities({
          device,
          slots: listTvButtonSlots(),
        });
      } else {
        await this.publishMappedButtonEntities({
          device,
          slots: listSoundbarButtonSlots(),
        });
      }
      return;
    }

    const climateCommandTopic = topic(prefix, [...base, 'climate', 'mode', 'set']);
    const powerCommandTopic = topic(prefix, [...base, 'climate', 'power', 'set']);
    const temperatureCommandTopic = topic(prefix, [...base, 'climate', 'temperature', 'set']);
    const fanModeCommandTopic = topic(prefix, [...base, 'climate', 'fan_mode', 'set']);
    const modeStateTopic = topic(prefix, [...base, 'climate', 'mode']);
    const powerStateTopic = topic(prefix, [...base, 'climate', 'power']);
    const temperatureStateTopic = topic(prefix, [...base, 'climate', 'temperature']);
    const currentTemperatureTopic = topic(prefix, [...base, 'climate', 'current_temperature']);
    const fanModeStateTopic = topic(prefix, [...base, 'climate', 'fan_mode']);
    await this.client.publish(
      topic(prefix, ['climate', BRIDGE_ID, device.id, 'config']),
      JSON.stringify(
        acClimateDiscoveryPayload({
          name: device.name,
          uniqueId: `${BRIDGE_ID}_${device.id}_climate`,
          deviceName: device.name,
          deviceIdentifier: `${BRIDGE_ID}_${device.id}`,
          modeCommandTopic: climateCommandTopic,
          modeStateTopic,
          powerCommandTopic,
          powerStateTopic,
          temperatureCommandTopic,
          temperatureStateTopic,
          currentTemperatureTopic,
          fanModeCommandTopic,
          fanModeStateTopic,
        }),
      ),
      { retain: true },
    );
    await this.client.subscribe(climateCommandTopic);
    await this.client.subscribe(powerCommandTopic);
    await this.client.subscribe(temperatureCommandTopic);
    await this.client.subscribe(fanModeCommandTopic);
    await this.publishClimateState(device);
    await this.publishAcExtraEntities(device);
  }

  private async publishFanState(device: DeviceMapping): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const fanState = asFanState(device.assumedState);
    await this.client.publish(
      topic(prefix, [...base, 'fan', 'state']),
      fanState.isOn ? 'ON' : 'OFF',
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'fan', 'percentage']),
      String(fanState.speed),
      { retain: true },
    );
    if (device.slots.led) {
      await this.client.publish(
        topic(prefix, [...base, 'led', 'state']),
        fanState.isLedOn ? 'ON' : 'OFF',
        { retain: true },
      );
    }
  }

  private async publishClimateState(device: DeviceMapping): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const climateState = asClimateState(device.assumedState);
    const rememberedTemperatureC = rememberedAcTemperatureC(climateState);
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'power']),
      climateState.isOn ? 'ON' : 'OFF',
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'mode']),
      climateState.isOn && climateState.mode && isAcHvacMode(climateState.mode)
        ? climateState.mode
        : climateState.isOn
          ? 'cool'
          : 'off',
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'temperature']),
      String(rememberedTemperatureC),
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'current_temperature']),
      String(rememberedTemperatureC),
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'fan_mode']),
      publishedAcFanMode(climateState),
      { retain: true },
    );
  }

  private async publishMappedButtonEntities({
    device,
    slots,
  }: {
    device: DeviceMapping;
    slots: SlotDefinition[];
  }): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const haDevice = { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name };

    for (const slot of slots) {
      const configTopic = topic(prefix, ['button', BRIDGE_ID, `${device.id}_${slot.id}`, 'config']);
      if (!device.slots[slot.id]) {
        await this.client.publish(configTopic, '', { retain: true });
        continue;
      }
      const commandTopic = topic(prefix, [...base, 'button', slot.id, 'set']);
      await this.client.publish(
        configTopic,
        JSON.stringify({
          name: `${device.name} ${slot.label}`,
          unique_id: `${BRIDGE_ID}_${device.id}_${slot.id}`,
          command_topic: commandTopic,
          payload_press: 'PRESS',
          device: haDevice,
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
    }
  }

  private async publishCatalogFanExtraButtons({
    device,
    catalog,
  }: {
    device: DeviceMapping;
    catalog: Catalog;
  }): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const haDevice = { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name };

    for (const extraButton of listCatalogFanExtraButtons({
      catalog,
      remoteId: device.tuyaRemoteId,
    })) {
      const slug = catalogFanButtonSlug(extraButton);
      const commandTopic = topic(prefix, [...base, 'button', slug, 'set']);
      await this.client.publish(
        topic(prefix, ['button', BRIDGE_ID, `${device.id}_${slug}`, 'config']),
        JSON.stringify({
          name: `${device.name} ${extraButton.keyName}`,
          unique_id: `${BRIDGE_ID}_${device.id}_${slug}`,
          command_topic: commandTopic,
          payload_press: 'PRESS',
          device: haDevice,
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
    }
  }

  private async publishAcExtraEntities(device: DeviceMapping): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const haDevice = { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name };
    const climateState = asClimateState(device.assumedState);

    for (const slot of listAcButtonSlots()) {
      const configTopic = topic(prefix, ['button', BRIDGE_ID, `${device.id}_${slot.id}`, 'config']);
      if (!device.slots[slot.id]) {
        await this.client.publish(configTopic, '', { retain: true });
        continue;
      }
      const commandTopic = topic(prefix, [...base, 'button', slot.id, 'set']);
      await this.client.publish(
        configTopic,
        JSON.stringify({
          name: `${device.name} ${slot.label}`,
          unique_id: `${BRIDGE_ID}_${device.id}_${slot.id}`,
          command_topic: commandTopic,
          payload_press: 'PRESS',
          device: haDevice,
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
    }

    const mappedPowerSavingSlots = listAcPowerSavingSlots().filter((slot) =>
      Boolean(device.slots[slot.id]),
    );
    const selectConfigTopic = topic(prefix, [
      'select',
      BRIDGE_ID,
      `${device.id}_power_saving`,
      'config',
    ]);
    const isTrainerDevice = isTrainerBackedDevice(device);
    if (!isTrainerDevice && mappedPowerSavingSlots.length === 0) {
      await this.client.publish(selectConfigTopic, '', { retain: true });
      return;
    }
    const commandTopic = topic(prefix, [...base, 'select', 'power_saving', 'set']);
    const options = isTrainerDevice
      ? [...TRAINER_POWER_SAVING_HA_OPTIONS]
      : AC_POWER_SAVING_SLOT_IDS.filter((slotId) => Boolean(device.slots[slotId])).map(
          (slotId) => AC_POWER_SAVING_OPTION_BY_SLOT_ID[slotId],
        );
    await this.client.publish(
      selectConfigTopic,
      JSON.stringify({
        name: `${device.name} Power saving`,
        unique_id: `${BRIDGE_ID}_${device.id}_power_saving`,
        command_topic: commandTopic,
        state_topic: topic(prefix, [...base, 'select', 'power_saving']),
        options,
        device: haDevice,
      }),
      { retain: true },
    );
    await this.client.subscribe(commandTopic);
    const publishedPowerSaving = isTrainerDevice
      ? trainerPowerSavingHaLabel(climateState.powerSaving)
      : climateState.powerSaving;
    if (publishedPowerSaving && options.includes(publishedPowerSaving)) {
      await this.client.publish(
        topic(prefix, [...base, 'select', 'power_saving']),
        publishedPowerSaving,
        { retain: true },
      );
    }
  }

  private async handleClimateBurst({
    deviceId,
    commands,
  }: {
    deviceId: string;
    commands: ClimateMqttCommand[];
  }): Promise<void> {
    const catalog = await this.jsonStore.readCatalog();
    const mapping = await this.jsonStore.readMapping();
    if (!catalog) {
      console.warn(`MQTT climate ignored for ${deviceId}: no catalog`);
      return;
    }
    const device = mapping.devices.find((item) => item.id === deviceId);
    if (!device || device.template !== 'ac') {
      console.warn(
        `MQTT climate ignored for ${deviceId}: ${device ? device.template : 'unknown device'}`,
      );
      return;
    }

    const previousClimateState = asClimateState(device.assumedState);
    const isTrainerDevice = isTrainerBackedDevice(device);
    const nextState = applyClimateMqttBurst({
      state: previousClimateState,
      commands,
      shouldApplyAllFields: isTrainerDevice,
    });
    device.assumedState = nextState;
    await this.publishClimateState(device);
    const nextMapping: MappingFile = {
      ...mapping,
      devices: mapping.devices.map((item) => (item.id === device.id ? device : item)),
    };
    await this.jsonStore.writeMapping(nextMapping);

    const sendAcButton = async (buttonId: string) => {
      const sendResult = await sendCatalogButton({
        catalog,
        buttonId,
        cloudClient: this.getCloudClient(),
        configuredIp: this.appConfig.tuyaLocalIp,
        configuredMac: this.appConfig.tuyaLocalMac,
      });
      console.log(
        `MQTT climate sent ${deviceId} ${buttonId} via ${sendResult.path} remote ${sendResult.remoteId}`,
      );
    };

    try {
      if (isTrainerDevice) {
        const trainer = await this.jsonStore.readTrainer();
        const packets = listTrainerClimatePackets({
          trainer,
          previousState: previousClimateState,
          nextState,
        });
        await this.sendTrainerPackets({ deviceId, packets, catalog, trainer });
      } else {
        const climateButtons = listAcClimateButtonsToSend({
          catalog,
          remoteId: device.tuyaRemoteId,
          previousState: previousClimateState,
          nextState,
        });
        for (const [buttonIndex, climateButton] of climateButtons.entries()) {
          if (buttonIndex > 0) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, RATE_LIMIT_DELAY_MS);
            });
          }
          console.log(
            `MQTT climate key ${deviceId} ${climateButton.keyName} (${climateButton.key})`,
          );
          await sendAcButton(climateButton.id);
        }
        if (climateButtons.length === 0) {
          const hasFanCommand = commands.some((command) => command.kind === 'fan_mode');
          const hasTemperatureCommand = commands.some((command) => command.kind === 'temperature');
          const skipReason =
            hasFanCommand && normalizeAcHvacMode(nextState.mode) === 'dry'
              ? 'dry locks fan at low; Fan 2/3 IR not sent'
              : hasTemperatureCommand
                ? 'Custom has no absolute temp IR; card memory updated only'
                : 'no IR for this snapshot';
          console.log(
            `MQTT climate ${deviceId} ${skipReason} (mode ${nextState.mode ?? 'cool'} ${rememberedAcTemperatureC(nextState)}C ${publishedAcFanMode(nextState)})`,
          );
        }
      }
    } catch (error) {
      console.error(
        `MQTT climate command failed for ${deviceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async handleCommand({
    messageTopic,
    payload,
  }: {
    messageTopic: string;
    payload: string;
  }): Promise<void> {
    const catalog = await this.jsonStore.readCatalog();
    const mapping = await this.jsonStore.readMapping();
    if (!catalog) {
      console.warn(`MQTT command ignored for ${messageTopic}: no catalog`);
      return;
    }

    const deviceId = mqttDeviceIdFromTopic(messageTopic);
    const device = mapping.devices.find((item) => item.id === deviceId);
    if (!deviceId || !device) {
      console.warn(`MQTT command ignored for ${messageTopic}: unknown device ${deviceId}`);
      return;
    }

    const sendCatalogKey = async (buttonId: string, label: string) => {
      const sendResult = await sendCatalogButton({
        catalog,
        buttonId,
        cloudClient: this.getCloudClient(),
        configuredIp: this.appConfig.tuyaLocalIp,
        configuredMac: this.appConfig.tuyaLocalMac,
      });
      console.log(
        `MQTT sent ${device.name} ${label} via ${sendResult.path} remote ${sendResult.remoteId}`,
      );
    };

    const sendSlot = async (slotId: string) => {
      const slot = device.slots[slotId];
      if (!slot) {
        throw new Error(`Slot ${slotId} is not mapped on ${device.name}`);
      }
      const sendResult = await sendCatalogButton({
        catalog,
        buttonId: slot.buttonId,
        cloudClient: this.getCloudClient(),
        configuredIp: this.appConfig.tuyaLocalIp,
        configuredMac: this.appConfig.tuyaLocalMac,
      });
      console.log(
        `MQTT sent ${device.name} ${slotId} via ${sendResult.path} remote ${sendResult.remoteId}`,
      );
    };

    try {
      let pendingSend: (() => Promise<void>) | undefined;
      if (device.template === 'fan') {
        const fanState = asFanState(device.assumedState);
        if (messageTopic.includes('/button/') && messageTopic.endsWith('/set')) {
          const slug = buttonSlugFromTopic(messageTopic);
          if (!slug) {
            return;
          }
          const extraButton = findCatalogFanExtraButton({
            catalog,
            remoteId: device.tuyaRemoteId,
            slug,
          });
          pendingSend = () => sendCatalogKey(extraButton.id, slug);
        } else if (messageTopic.endsWith('/fan/set')) {
          fanState.isOn = payload === 'ON';
          console.log(`MQTT fan ${deviceId} power ${payload}`);
          const powerButton = resolveFanPowerButtonToSend({ catalog, device });
          pendingSend = () => sendCatalogKey(powerButton.buttonId, powerButton.label);
        } else if (messageTopic.endsWith('/fan/percentage/set')) {
          const speedCeiling = catalogFanSpeedRangeMax({
            catalog,
            remoteId: device.tuyaRemoteId,
          });
          const speed = normalizeRequestedFanSpeed({
            speed: Number(payload),
            speedCeiling,
          });
          fanState.isOn = true;
          fanState.speed = speed;
          const speedButton = resolveFanSpeedButtonToSend({ catalog, device, speed });
          console.log(`MQTT fan ${deviceId} speed ${fanState.speed} ${speedButton.label}`);
          pendingSend = () => sendCatalogKey(speedButton.buttonId, speedButton.label);
        } else if (messageTopic.endsWith('/led/set')) {
          fanState.isLedOn = payload === 'ON';
          pendingSend = () => sendSlot('led');
        } else {
          return;
        }
        device.assumedState = fanState;
      } else if (device.template === 'tv' || device.template === 'soundbar') {
        const mediaState = asMediaState(device.assumedState);
        if (messageTopic.includes('/button/') && messageTopic.endsWith('/set')) {
          const slotId = buttonSlugFromTopic(messageTopic);
          if (!slotId) {
            return;
          }
          await sendSlot(slotId);
        } else if (messageTopic.endsWith('/media/volume_up')) {
          await sendSlot('vol_up');
        } else if (messageTopic.endsWith('/media/volume_down')) {
          await sendSlot('vol_down');
        } else if (messageTopic.endsWith('/media/source/set')) {
          await sendSlot('source_hdmi');
        } else {
          const command = payload.toUpperCase();
          if (command === 'ON' || command === 'OFF') {
            mediaState.isOn = command === 'ON';
            await sendSlot('power');
          } else if (command === 'PLAY') {
            await sendSlot('play');
          } else if (command === 'PAUSE') {
            await sendSlot('pause');
          } else if (command === 'NEXT') {
            await sendSlot('next');
          } else if (command === 'PREVIOUS') {
            await sendSlot('previous');
          } else if (command === 'VOLUME_UP') {
            await sendSlot('vol_up');
          } else if (command === 'VOLUME_DOWN') {
            await sendSlot('vol_down');
          } else if (command === 'MUTE') {
            mediaState.isMuted = !mediaState.isMuted;
            await sendSlot('mute');
          }
        }
        device.assumedState = mediaState;
      } else {
        const previousClimateState = asClimateState(device.assumedState);
        if (messageTopic.includes('/button/') && messageTopic.endsWith('/set')) {
          const slotId = buttonSlugFromTopic(messageTopic);
          if (!slotId) {
            return;
          }
          await sendSlot(slotId);
        } else if (messageTopic.endsWith('/select/power_saving/set')) {
          if (isTrainerBackedDevice(device)) {
            const optionId = trainerPowerSavingOptionIdFromHa(payload);
            if (!optionId) {
              return;
            }
            const trainer = await this.jsonStore.readTrainer();
            const packets = listTrainerPowerSavingPackets({ trainer, optionId });
            await this.sendTrainerPackets({ deviceId: device.id, packets, catalog, trainer });
            previousClimateState.powerSaving = trainerPowerSavingHaLabel(optionId) ?? payload;
            device.assumedState = previousClimateState;
          } else {
            const slotId = acPowerSavingSlotIdByOption(payload);
            if (!slotId || !device.slots[slotId]) {
              return;
            }
            await sendSlot(slotId);
            previousClimateState.powerSaving = payload;
            device.assumedState = previousClimateState;
          }
        } else {
          return;
        }
      }

      const nextMapping: MappingFile = {
        ...mapping,
        devices: mapping.devices.map((item) => (item.id === device.id ? device : item)),
      };
      await this.jsonStore.writeMapping(nextMapping);
      if (device.template === 'ac') {
        await this.publishClimateState(device);
        if (isTrainerBackedDevice(device)) {
          await this.publishAcExtraEntities(device);
        }
      } else if (device.template === 'fan') {
        await this.publishFanState(device);
      } else {
        await this.publishDevice(device);
      }
      if (pendingSend) {
        await pendingSend();
      }
    } catch (error) {
      console.error(
        `MQTT command failed for ${messageTopic}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendTrainerPackets({
    deviceId,
    packets,
    catalog,
    trainer,
  }: {
    deviceId: string;
    packets: { bits: string; label: string }[];
    catalog: Catalog;
    trainer: TrainerFile;
  }): Promise<void> {
    if (!catalog.local.key) {
      throw new Error('No catalog local key. Run export first.');
    }
    const localDevice = await resolveLocalBlaster({
      localDevice: catalog.local,
      configuredIp: this.appConfig.tuyaLocalIp,
      configuredMac: this.appConfig.tuyaLocalMac,
    });
    if (!localDevice?.host) {
      throw new Error('IR blaster LAN host was not found');
    }
    for (const [packetIndex, packet] of packets.entries()) {
      if (packetIndex > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RATE_LIMIT_DELAY_MS);
        });
      }
      const sendResult = await sendTrainerIrBits({ bits: packet.bits, localDevice, trainer });
      console.log(
        `MQTT trainer sent ${deviceId} ${packet.label} ${sendResult.bitCount} bits (${sendResult.pulseCount} pulses) to ${localDevice.host}`,
      );
    }
  }
}
