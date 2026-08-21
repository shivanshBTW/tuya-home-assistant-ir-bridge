import mqtt from 'mqtt';
import type { AppConfig } from '../config.js';
import {
  FAN_SPEED_COUNT,
  TV_HDMI_SOURCE_NAME,
  AC_POWER_SAVING_OPTION_BY_SLOT_ID,
  AC_POWER_SAVING_SLOT_IDS,
  acPowerSavingSlotIdByOption,
  listAcButtonSlots,
  listAcPowerSavingSlots,
  listTvButtonSlots,
} from '../templates/deviceTemplates.js';
import {
  AC_DEFAULT_TEMPERATURE_C,
  AC_FAN_MODES,
  AC_HVAC_MODES,
  AC_MAX_TEMPERATURE_C,
  AC_MIN_TEMPERATURE_C,
  applyAcFanModeCommand,
  applyAcModeCommand,
  applyAcPowerCommand,
  applyAcTemperatureCommand,
  findAcLibraryButton,
  findAcPowerButton,
  isAcHvacMode,
  publishedAcFanMode,
} from '../templates/acCommand.js';
import type {
  ClimateAssumedState,
  DeviceMapping,
  FanAssumedState,
  MappingFile,
  MediaAssumedState,
} from '../types.js';
import { sendCatalogButton } from '../tuya/sendButton.js';
import type { TuyaCloudClient } from '../tuya/cloudClient.js';
import type { JsonStore } from '../store/jsonStore.js';

const BRIDGE_ID = 'tuya_ha_ir_bridge';

const topic = (prefix: string, parts: string[]): string => `${prefix}/${parts.join('/')}`;

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
      void this.handleCommand({ messageTopic, payload: payload.toString() });
    });

    await this.publishAll();
    console.log('MQTT discovery published');
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
      const fanState = asFanState(device.assumedState);
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
          speed_range_max: FAN_SPEED_COUNT,
          payload_on: 'ON',
          payload_off: 'OFF',
          device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
      await this.client.subscribe(percentageCommandTopic);
      await this.client.publish(
        topic(prefix, [...base, 'fan', 'state']),
        fanState.isOn ? 'ON' : 'OFF',
        {
          retain: true,
        },
      );
      await this.client.publish(
        topic(prefix, [...base, 'fan', 'percentage']),
        String(fanState.speed),
        { retain: true },
      );

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
            device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
          }),
          { retain: true },
        );
        await this.client.subscribe(ledCommandTopic);
        await this.client.publish(
          topic(prefix, [...base, 'led', 'state']),
          fanState.isLedOn ? 'ON' : 'OFF',
          { retain: true },
        );
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
        await this.publishTvButtonEntities(device);
      }
      return;
    }

    const climateState = asClimateState(device.assumedState);
    const climateCommandTopic = topic(prefix, [...base, 'climate', 'mode', 'set']);
    const powerCommandTopic = topic(prefix, [...base, 'climate', 'power', 'set']);
    const temperatureCommandTopic = topic(prefix, [...base, 'climate', 'temperature', 'set']);
    const fanModeCommandTopic = topic(prefix, [...base, 'climate', 'fan_mode', 'set']);
    await this.client.publish(
      topic(prefix, ['climate', BRIDGE_ID, device.id, 'config']),
      JSON.stringify({
        name: device.name,
        unique_id: `${BRIDGE_ID}_${device.id}_climate`,
        mode_command_topic: climateCommandTopic,
        mode_state_topic: topic(prefix, [...base, 'climate', 'mode']),
        modes: [...AC_HVAC_MODES],
        power_command_topic: powerCommandTopic,
        power_state_topic: topic(prefix, [...base, 'climate', 'power']),
        payload_on: 'ON',
        payload_off: 'OFF',
        temperature_command_topic: temperatureCommandTopic,
        temperature_state_topic: topic(prefix, [...base, 'climate', 'temperature']),
        min_temp: AC_MIN_TEMPERATURE_C,
        max_temp: AC_MAX_TEMPERATURE_C,
        temp_step: 1,
        fan_mode_command_topic: fanModeCommandTopic,
        fan_mode_state_topic: topic(prefix, [...base, 'climate', 'fan_mode']),
        fan_modes: [...AC_FAN_MODES],
        device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
      }),
      { retain: true },
    );
    await this.client.subscribe(climateCommandTopic);
    await this.client.subscribe(powerCommandTopic);
    await this.client.subscribe(temperatureCommandTopic);
    await this.client.subscribe(fanModeCommandTopic);
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'power']),
      climateState.isOn ? 'ON' : 'OFF',
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'mode']),
      climateState.mode && isAcHvacMode(climateState.mode) ? climateState.mode : 'cool',
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'temperature']),
      String(climateState.temperatureC ?? AC_DEFAULT_TEMPERATURE_C),
      { retain: true },
    );
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'fan_mode']),
      publishedAcFanMode(climateState),
      { retain: true },
    );
    await this.publishAcExtraEntities(device);
  }

  private async publishTvButtonEntities(device: DeviceMapping): Promise<void> {
    if (!this.client) {
      return;
    }
    const prefix = this.appConfig.mqttDiscoveryPrefix;
    const base = [BRIDGE_ID, device.id];
    const haDevice = { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name };

    for (const slot of listTvButtonSlots()) {
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
    const selectConfigTopic = topic(prefix, ['select', BRIDGE_ID, `${device.id}_power_saving`, 'config']);
    if (mappedPowerSavingSlots.length === 0) {
      await this.client.publish(selectConfigTopic, '', { retain: true });
      return;
    }
    const commandTopic = topic(prefix, [...base, 'select', 'power_saving', 'set']);
    const options = AC_POWER_SAVING_SLOT_IDS.filter((slotId) => Boolean(device.slots[slotId])).map(
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
    if (climateState.powerSaving && options.includes(climateState.powerSaving)) {
      await this.client.publish(
        topic(prefix, [...base, 'select', 'power_saving']),
        climateState.powerSaving,
        { retain: true },
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
      return;
    }

    const parts = messageTopic.split('/');
    const deviceId = parts[2];
    const device = mapping.devices.find((item) => item.id === deviceId);
    if (!device) {
      return;
    }

    const sendSlot = async (slotId: string) => {
      const slot = device.slots[slotId];
      if (!slot) {
        throw new Error(`Slot ${slotId} is not mapped on ${device.name}`);
      }
      await sendCatalogButton({
        catalog,
        buttonId: slot.buttonId,
        cloudClient: this.getCloudClient(),
      });
    };

    try {
      if (device.template === 'fan') {
        const fanState = asFanState(device.assumedState);
        if (messageTopic.endsWith('/fan/set')) {
          fanState.isOn = payload === 'ON';
          await sendSlot('power');
        } else if (messageTopic.endsWith('/fan/percentage/set')) {
          const speed = Math.min(FAN_SPEED_COUNT, Math.max(1, Number(payload)));
          fanState.isOn = true;
          fanState.speed = speed;
          await sendSlot(`speed_${speed}`);
        } else if (messageTopic.endsWith('/led/set')) {
          fanState.isLedOn = payload === 'ON';
          await sendSlot('led');
        }
        device.assumedState = fanState;
      } else if (device.template === 'tv' || device.template === 'soundbar') {
        const mediaState = asMediaState(device.assumedState);
        if (messageTopic.includes('/button/') && messageTopic.endsWith('/set')) {
          const slotId = parts[4];
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
        const sendAcButton = async (buttonId: string) => {
          await sendCatalogButton({
            catalog,
            buttonId,
            cloudClient: this.getCloudClient(),
          });
        };
        const sendAcClimate = async (nextState: ClimateAssumedState) => {
          if (!nextState.isOn) {
            await sendAcButton(
              findAcPowerButton({
                catalog,
                remoteId: device.tuyaRemoteId,
                isOn: false,
              }).id,
            );
            return;
          }
          if (!previousClimateState.isOn) {
            await sendAcButton(
              findAcPowerButton({
                catalog,
                remoteId: device.tuyaRemoteId,
                isOn: true,
              }).id,
            );
          }
          await sendAcButton(
            findAcLibraryButton({
              catalog,
              remoteId: device.tuyaRemoteId,
              state: nextState,
            }).id,
          );
        };

        if (messageTopic.includes('/button/') && messageTopic.endsWith('/set')) {
          const slotId = parts[4];
          if (!slotId) {
            return;
          }
          await sendSlot(slotId);
        } else if (messageTopic.endsWith('/select/power_saving/set')) {
          const slotId = acPowerSavingSlotIdByOption(payload);
          if (!slotId || !device.slots[slotId]) {
            return;
          }
          await sendSlot(slotId);
          previousClimateState.powerSaving = payload;
          device.assumedState = previousClimateState;
        } else if (messageTopic.endsWith('/climate/power/set')) {
          const nextState = applyAcPowerCommand({
            state: previousClimateState,
            isOn: payload.toUpperCase() === 'ON',
          });
          await sendAcClimate(nextState);
          device.assumedState = nextState;
        } else if (messageTopic.endsWith('/climate/mode/set')) {
          if (payload === 'off') {
            const nextState = applyAcPowerCommand({ state: previousClimateState, isOn: false });
            await sendAcClimate(nextState);
            device.assumedState = nextState;
          } else {
            const nextState = applyAcModeCommand({ state: previousClimateState, mode: payload });
            if (!nextState) {
              await this.publishDevice(device);
              return;
            }
            await sendAcClimate(nextState);
            device.assumedState = nextState;
          }
        } else if (messageTopic.endsWith('/climate/temperature/set')) {
          const nextState = applyAcTemperatureCommand({
            state: previousClimateState,
            temperatureC: Number(payload),
          });
          if (!nextState) {
            await this.publishDevice(device);
            return;
          }
          await sendAcClimate(nextState);
          device.assumedState = nextState;
        } else if (messageTopic.endsWith('/climate/fan_mode/set')) {
          const nextState = applyAcFanModeCommand({
            state: previousClimateState,
            fanMode: payload,
          });
          if (!nextState) {
            await this.publishDevice(device);
            return;
          }
          await sendAcClimate(nextState);
          device.assumedState = nextState;
        } else {
          return;
        }
      }

      const nextMapping: MappingFile = {
        ...mapping,
        devices: mapping.devices.map((item) => (item.id === device.id ? device : item)),
      };
      await this.jsonStore.writeMapping(nextMapping);
      await this.publishDevice(device);
    } catch (error) {
      console.error(
        `MQTT command failed for ${messageTopic}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
