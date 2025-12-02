declare module "bullmq" {
  export interface JobsOptions {
    repeat?: any;
    attempts?: number;
    backoff?: any;
    delay?: number;
    jobId?: string;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    priority?: number;
  }

  export interface QueueOptions {
    connection?: any;
  }

  export interface WorkerOptions {
    connection?: any;
    concurrency?: number;
    limiter?: any;
  }

  export interface Job<Data = any> {
    id?: string;
    data: Data;
    updateData: (data: Data) => Promise<void>;
    moveToDelayed: (timestamp: number) => Promise<void>;
  }

  export class Queue<DataType = any> {
    constructor(name: string, opts?: QueueOptions);
    add(name: string, data: DataType, opts?: JobsOptions): Promise<Job>;
    addBulk(jobs: Array<{ name: string; data: DataType; opts?: JobsOptions }>): Promise<Job[]>;
    getRepeatableJobs(): Promise<Array<{ key: string; id?: string }>>;
    removeRepeatableByKey(key: string): Promise<void>;
  }

  export class Worker<DataType = any> {
    constructor(name: string, processor: (job: Job<DataType>) => any, opts?: WorkerOptions);
    on(event: string, handler: (...args: any[]) => void): void;
    close(): Promise<void>;
  }
}
