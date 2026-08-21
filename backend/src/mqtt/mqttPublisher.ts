import mqtt from 'mqtt';
import type { AppConfig } from '../config.js';
import { FAN_SPEED_COUNT } from '../templates/deviceTemplates.js';
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
      await this.client.publish(topic(prefix, [...base, 'fan', 'state']), fanState.isOn ? 'ON' : 'OFF', {
        retain: true,
      });
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
      const deviceClass = device.template === 'tv' ? 'tv' : 'speaker';
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
          device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
        }),
        { retain: true },
      );
      await this.client.subscribe(commandTopic);
      await this.client.publish(
        topic(prefix, [...base, 'media', 'state']),
        mediaState.isOn ? 'ON' : 'OFF',
        { retain: true },
      );
      return;
    }

    const climateState = asClimateState(device.assumedState);
    const climateCommandTopic = topic(prefix, [...base, 'climate', 'mode', 'set']);
    await this.client.publish(
      topic(prefix, ['climate', BRIDGE_ID, device.id, 'config']),
      JSON.stringify({
        name: device.name,
        unique_id: `${BRIDGE_ID}_${device.id}_climate`,
        mode_command_topic: climateCommandTopic,
        mode_state_topic: topic(prefix, [...base, 'climate', 'mode']),
        modes: ['off', 'cool', 'heat', 'fan_only', 'dry'],
        temperature_command_topic: topic(prefix, [...base, 'climate', 'temperature', 'set']),
        temperature_state_topic: topic(prefix, [...base, 'climate', 'temperature']),
        min_temp: 16,
        max_temp: 30,
        device: { identifiers: [`${BRIDGE_ID}_${device.id}`], name: device.name },
      }),
      { retain: true },
    );
    await this.client.subscribe(climateCommandTopic);
    await this.client.subscribe(topic(prefix, [...base, 'climate', 'temperature', 'set']));
    await this.client.publish(
      topic(prefix, [...base, 'climate', 'mode']),
      climateState.isOn ? (climateState.mode ?? 'cool') : 'off',
      { retain: true },
    );
    if (climateState.temperatureC !== undefined) {
      await this.client.publish(
        topic(prefix, [...base, 'climate', 'temperature']),
        String(climateState.temperatureC),
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
        device.assumedState = mediaState;
      } else {
        const climateState = asClimateState(device.assumedState);
        if (messageTopic.endsWith('/climate/mode/set')) {
          climateState.isOn = payload !== 'off';
          if (payload === 'off') {
            await sendSlot('power');
          } else if (payload === 'fan_only') {
            climateState.mode = 'fan_only';
            await sendSlot('mode_fan');
          } else if (payload === 'cool' || payload === 'heat' || payload === 'dry') {
            climateState.mode = payload;
            await sendSlot(`mode_${payload}`);
          }
        } else if (messageTopic.endsWith('/climate/temperature/set')) {
          const nextTemperature = Number(payload);
          if (climateState.temperatureC !== undefined) {
            await sendSlot(nextTemperature > climateState.temperatureC ? 'temp_up' : 'temp_down');
          }
          climateState.temperatureC = nextTemperature;
        }
        device.assumedState = climateState;
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
