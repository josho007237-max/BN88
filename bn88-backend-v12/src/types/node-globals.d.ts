declare namespace NodeJS {
  interface Process {
    env: Record<string, any>;
    exit(code?: number): void;
    on: (...args: any[]) => void;
  }
  interface Timeout {}
  type Signals = string;
}

declare var process: NodeJS.Process;
interface Console {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  table?: (...args: any[]) => void;
}
declare var console: Console;
declare var global: any;
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearTimeout(timeoutId?: any): void;
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearInterval(timeoutId?: any): void;

declare var fetch: any;
declare function require(name: string): any;
type Buffer = any;
interface BufferConstructor {
  isBuffer?: (input: any) => boolean;
  from?: (...args: any[]) => any;
}
declare var Buffer: BufferConstructor;
declare module 'crypto' {
  export function randomUUID(): string;
}
