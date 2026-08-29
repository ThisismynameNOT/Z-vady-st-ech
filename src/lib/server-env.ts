import { env } from 'cloudflare:workers';
export type WorkerEnv = Record<string, any>;
export function workerEnv():WorkerEnv { return env as unknown as WorkerEnv; }
