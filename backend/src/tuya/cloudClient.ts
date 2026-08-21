import { TuyaContext } from '@tuya/tuya-connector-nodejs';
import { RATE_LIMIT_DELAY_MS } from '../constants.js';

export interface TuyaCloudClientOptions {
  apiEndpoint: string;
  accessId: string;
  accessSecret: string;
}

export interface TuyaRequestResult<T> {
  success: boolean;
  result?: T;
  msg?: string;
  code?: number;
}

const sleep = async (delayMs: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

export class TuyaCloudClient {
  private readonly tuyaContext: TuyaContext;

  constructor(options: TuyaCloudClientOptions) {
    this.tuyaContext = new TuyaContext({
      baseUrl: options.apiEndpoint,
      accessKey: options.accessId,
      secretKey: options.accessSecret,
    });
  }

  async request<T>(input: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): Promise<T> {
    await sleep(RATE_LIMIT_DELAY_MS);
    const response = (await this.tuyaContext.request({
      method: input.method,
      path: input.path,
      query: input.query,
      body: input.body,
    })) as TuyaRequestResult<T>;

    if (!response.success) {
      throw new Error(response.msg ?? `Tuya request failed for ${input.path}`);
    }

    return response.result as T;
  }
}
