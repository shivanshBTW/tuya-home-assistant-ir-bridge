import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { loadConfig, requireTuyaCloudConfig } from './config.js';
import { MqttPublisher } from './mqtt/mqttPublisher.js';
import { registerRoutes } from './routes/api.js';
import { JsonStore } from './store/jsonStore.js';
import { TuyaCloudClient } from './tuya/cloudClient.js';

const start = async () => {
  const appConfig = loadConfig();
  const jsonStore = new JsonStore(appConfig.dataDir);
  await jsonStore.ensureDataDir();

  const getCloudClient = () => {
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

  const mqttPublisher = new MqttPublisher(appConfig, jsonStore, getCloudClient);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/health' || !request.url.startsWith('/api/')) {
      return;
    }
    const headerToken = request.headers['x-api-token'];
    const authHeader = request.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : undefined;
    const token = (typeof headerToken === 'string' ? headerToken : undefined) ?? bearer;
    if (token !== appConfig.apiToken) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message === 'Unauthorized' ? 401 : 400;
    reply.code(statusCode).send({ error: message });
  });

  registerRoutes({ app, appConfig, jsonStore, mqttPublisher });

  if (existsSync(appConfig.frontendDistDir)) {
    await app.register(fastifyStatic, {
      root: appConfig.frontendDistDir,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.code(404).send({ error: 'Not found' });
        return;
      }
      void reply.sendFile('index.html');
    });
  }

  try {
    await mqttPublisher.start();
  } catch (error) {
    app.log.warn(
      `MQTT did not start: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await app.listen({ host: appConfig.host, port: appConfig.port });
};

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
