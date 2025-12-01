declare module "redis" {
  export interface RedisMultiCommandType {
    incr(key: string): this;
    expire(key: string, seconds: number, mode?: string): this;
    exec(): Promise<(number | null | string)[] | null>;
  }

  export interface RedisClientType {
    connect(): Promise<void>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number, mode?: string): Promise<number>;
    ttl(key: string): Promise<number>;
    multi(): RedisMultiCommandType;
    on(event: string, listener: (...args: any[]) => void): this;
    quit(): Promise<void>;
  }

  export function createClient(options?: { url?: string }): RedisClientType;
}
