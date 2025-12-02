import 'dotenv/config';
 codex/analyze-bn88-project-structure-and-workflow-s9ghbu
import { startAllProcessors } from './processor';

import { startProcessor } from './processor';
 main
import { prisma } from '../config/db';
import { log } from '../utils/logger';

async function boot() {
  try {
    log('Worker starting...');
    await prisma.$connect();
    log('Prisma connected');

 codex/analyze-bn88-project-structure-and-workflow-s9ghbu
    const workers = startAllProcessors();
    log('Processors started');

    const shutdown = async () => {
      log('Shutting down workers...');
      await Promise.all(workers.map(w => w.close()));

    const worker = startProcessor();
    log('Processor started');

    const shutdown = async () => {
      log('Shutting down worker...');
      await worker.close();
  main
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
