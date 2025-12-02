const handlers = new Map();

class Queue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }
  async add(name, data, opts = {}) {
    const handler = handlers.get(this.name);
    const job = {
      name,
      data,
      opts,
      id: opts.jobId || `${this.name}-${this.jobs.length + 1}`,
      updateData: async (next) => {
        job.data = next;
      },
      moveToDelayed: async (timestamp) => {
        const delay = Math.max(0, timestamp - Date.now());
        setTimeout(async () => {
          await handler?.(job);
        }, delay);
      },
    };
    this.jobs.push(job);
    if (handler) await handler(job);
    return job;
  }
  async getRepeatableJobs() {
    return [];
  }
  async removeRepeatableByKey() {
    return;
  }
}

class Worker {
  constructor(name, handler) {
    this.name = name;
    handlers.set(name, handler);
  }
  on() {}
}

module.exports = { Queue, Worker, handlers, default: { Queue, Worker, handlers } };
