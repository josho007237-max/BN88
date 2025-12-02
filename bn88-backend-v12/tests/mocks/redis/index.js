const store = new Map();

const client = {
  async connect() {},
  async incr(key) {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || (entry.expiresAt && entry.expiresAt < now)) {
      store.set(key, { value: 1, expiresAt: null });
      return 1;
    }
    entry.value += 1;
    return entry.value;
  },
  async expire(key, seconds, mode) {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry) return 0;
    if (mode === "NX" && entry.expiresAt && entry.expiresAt > now) return 0;
    entry.expiresAt = now + seconds * 1000;
    store.set(key, entry);
    return 1;
  },
  async ttl(key) {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const diff = entry.expiresAt - now;
    if (diff <= 0) {
      store.delete(key);
      return -2;
    }
    return Math.floor(diff / 1000);
  },
  multi() {
    const ops = [];
    const multiOps = {
      incr: (key) => {
        ops.push(() => client.incr(key));
        return multiOps;
      },
      expire: (key, seconds, mode) => {
        ops.push(() => client.expire(key, seconds, mode));
        return multiOps;
      },
      exec: async () => Promise.all(ops.map((op) => op())),
    };
    return multiOps;
  },
};

function createClient() {
  return client;
}

module.exports = { createClient, default: { createClient }, __store: store };
