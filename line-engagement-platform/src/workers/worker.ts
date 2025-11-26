import 'dotenv/config';
import { startProcessor } from './processor';
import { prisma } from '../config/db';
import { log } from '../utils/logger';

async function boot() {
  try {
    log('Worker starting...');
    await prisma.$connect();
    log('Prisma connected');

    const worker = startProcessor();
    log('Processor started');

    const shutdown = async () => {
      log('Shutting down worker...');
      await worker.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Worker boot error', err);
    process.exit(1);
  }
}

boot();
