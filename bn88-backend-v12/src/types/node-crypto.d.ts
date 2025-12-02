declare module 'node:crypto' {
  export function randomUUID(): string;
  const crypto: any;
  export = crypto;
}
