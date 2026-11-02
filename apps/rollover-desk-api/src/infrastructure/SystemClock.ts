import type { IClock } from '../domain/ports/IClock';

export class SystemClock implements IClock {
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
