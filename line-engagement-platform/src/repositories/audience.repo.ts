import { prisma } from '../config/db';

export const AudienceRepo = {
  upsertByLineUser: async (
    lineUserId: string,
    data: Partial<{
      displayName: string;
      locale: string;
      tags: string[];
      lastActiveAt: Date;
    }>,
  ) => {
    return prisma.audience.upsert({
      where: { lineUserId },
      update: { ...data },
      create: {
        lineUserId,
        displayName: data.displayName,
        locale: data.locale,
        tags: data.tags ?? [],
        lastActiveAt: data.lastActiveAt,
      },
    });
  },

  addTag: async (lineUserId: string, tag: string) => {
    const a = await prisma.audience.findUnique({ where: { lineUserId } });
    const tags = Array.from(new Set([...(a?.tags ?? []), tag]));
    return prisma.audience.update({ where: { lineUserId }, data: { tags } });
  },

  list: async () => prisma.audience.findMany({ orderBy: { createdAt: 'desc' } }),

  findByTags: async (tags: string[]) =>
    prisma.audience.findMany({
      where: { tags: { hasSome: tags } },
      orderBy: { createdAt: 'desc' },
    }),
};
