import { MemoryToolGuardStore } from "./memoryToolGuardStore";
import type {
  ToolGuardIntent,
  ToolGuardStore,
} from "./toolGuard.types";

export class ToolGuardService {
  constructor(private readonly store: ToolGuardStore) {}

  allowMessage(sessionId: string, ip: string): boolean {
    return this.store.allowMessage(sessionId, ip);
  }

  canEmit(sessionId: string, intent: ToolGuardIntent): boolean {
    return this.store.canEmit(sessionId, intent);
  }

  recordEmission(sessionId: string, intent: ToolGuardIntent): void {
    this.store.recordEmission(sessionId, intent);
  }

  claimWrite(idempotencyKey: string): boolean {
    return this.store.claimWrite(idempotencyKey);
  }
}

export const toolGuardService = new ToolGuardService(new MemoryToolGuardStore());
