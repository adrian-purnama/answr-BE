import { MemoryStore } from "./memoryStore";
import { MongoStore } from "./mongoStore";
import type { RateLimitStore, RateLimitStoreKind } from "./rateLimit.types";

const memoryStore = new MemoryStore();
const mongoStore = new MongoStore();

export function getRateLimitStore(kind: RateLimitStoreKind): RateLimitStore {
  return kind === "memory" ? memoryStore : mongoStore;
}

export function getMemoryStore(): MemoryStore {
  return memoryStore;
}

export function getMongoStore(): MongoStore {
  return mongoStore;
}
