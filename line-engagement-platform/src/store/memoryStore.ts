export const store = {
  users: new Map<string, { tags: string[]; lastActive: number }>(),
  groups: new Map<string, { name?: string; members?: string[] }>(),
  channels: new Map<string, { name?: string }>(),
};
