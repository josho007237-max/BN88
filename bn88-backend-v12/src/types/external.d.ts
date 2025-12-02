declare module 'express' {
  export interface Request<P = any, ResBody = any, ReqBody = any, ReqQuery = any> {
    params?: P;
    body?: ReqBody;
    query?: ReqQuery;
    [key: string]: any;
  }
  export interface Response { [key: string]: any }
  export interface NextFunction { (...args: any[]): any }
  export interface Router {
    (): any;
    use: (...args: any[]) => any;
    get: (...args: any[]) => any;
    post: (...args: any[]) => any;
    patch: (...args: any[]) => any;
    put: (...args: any[]) => any;
    delete: (...args: any[]) => any;
  }
  const e: any;
  export function Router(): Router;
  export default e;
}
declare module 'express-serve-static-core' {
  export interface Request { [key: string]: any }
}
declare module 'express-rate-limit' { const fn: any; export = fn; }
declare module 'cors' { const fn: any; export = fn; }
declare module 'helmet' { const fn: any; export = fn; }
declare module 'compression' { const fn: any; export = fn; }
declare module 'morgan' { const fn: any; export = fn; }
declare module 'dotenv' { const fn: any; export = fn; }
declare module 'jsonwebtoken' {
  export interface JwtPayload { [key: string]: any }
  export type SignOptions = any;
  export type Secret = any;
  export function sign(payload: any, secret: any, options?: any): string;
  export function verify(token: string, secret: any): any;
  export default any;
}
declare module 'bcryptjs' { const fn: any; export = fn; }
declare module 'axios' {
  export interface AxiosInstance {
    (config: any): Promise<any>;
    get: (...args: any[]) => Promise<any>;
    post: (...args: any[]) => Promise<any>;
    patch?: (...args: any[]) => Promise<any>;
    delete?: (...args: any[]) => Promise<any>;
  }
  const axios: AxiosInstance & { create: (config?: any) => AxiosInstance };
  export default axios;
}
declare module 'openai' { const OpenAI: any; export = OpenAI; export default OpenAI; }
declare module '@line/bot-sdk' { const sdk: any; export = sdk; export default sdk; }
declare module 'zod' {
  export type infer<T> = any;
  export const z: any;
  export namespace z {
    export type infer<T> = any;
  }
  export const ZodError: any;
  const zDefault: any;
  export default zDefault;
}
