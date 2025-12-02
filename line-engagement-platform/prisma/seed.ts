import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('Seeding...');

  const a1 = await prisma.audience.upsert({
    where: { lineUserId: 'Uxxxxxxxxxx1' },
    update: {},
    create: {
      lineUserId: 'Uxxxxxxxxxx1',
      displayName: 'Alice',
      locale: 'th',
      tags: ['logged_in', 'vip'],
    },
  });

  const a2 = await prisma.audience.upsert({
    where: { lineUserId: 'Uxxxxxxxxxx2' },
    update: {},
    create: {
      lineUserId: 'Uxxxxxxxxxx2',
      displayName: 'Bob',
      locale: 'th',
      tags: ['follower'],
    },
  });

  const c1 = await prisma.campaign.create({
    data: {
      name: 'Promo Thai Seed',
      enabled: true,
      segmentType: 'tag',
      segmentQuery: { type: 'tag', tags: ['logged_in'] },
      message: 'ส่วนลดสำหรับสมาชิกที่ล็อกอินแล้ว 🎁',
      messagePayload: { type: 'text', text: 'ส่วนลดสำหรับสมาชิกที่ล็อกอินแล้ว 🎁' },
      status: 'draft',
    },
  });

  await prisma.campaignDelivery.create({
    data: {
      campaignId: c1.id,
      audienceId: a1.id,
      status: 'queued',
    },
  });

  await prisma.event.create({
    data: { type: 'follow', payload: { userId: a2.lineUserId } },
  });

  await prisma.event.create({
    data: {
      type: 'message',
      payload: { text: 'สวัสดี' },
      audienceId: a1.id,
    },
  });

  console.log('Seed done');
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
