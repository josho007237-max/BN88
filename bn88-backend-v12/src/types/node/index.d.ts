declare var process: any;
declare var console: any;
declare var global: any;
interface BufferConstructor {
  isBuffer?: (obj: any) => boolean;
  from?: (...args: any[]) => any;
}
declare var Buffer: BufferConstructor;
export {};
