declare module '@prisma/client' {
  export class PrismaClient {
    constructor(...args: any[]);
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
    $use?: any;
    $extends?: any;
    [key: string]: any;
  }
  export const Prisma: any;
  export namespace Prisma {
    export type PrismaClientKnownRequestError = any;
    export type BotUpdateInput = any;
    export type BotSecretUpdateInput = any;
    export type BotGetPayload<T> = any;
    export type BotSelect = any;
  }
  export type Bot = any;
  export type ChatMessage = any;
  export type Conversation = any;
  export type FAQ = any;
  export type EngagementMessage = any;
  export type Role = any;
  export type Permission = any;
  export type BotIntent = any;
  export type StatDaily = any;
  export const MessageType: {
    TEXT: "TEXT";
    IMAGE: "IMAGE";
    FILE: "FILE";
    STICKER: "STICKER";
    SYSTEM: "SYSTEM";
    RICH: "RICH";
    INLINE_KEYBOARD: "INLINE_KEYBOARD";
  };
  export type MessageType = (typeof MessageType)[keyof typeof MessageType];
}
