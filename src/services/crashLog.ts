/**
 * Records the last fatal JavaScript error so the next launch can show it to the
 * user (who can share it with the developer). Imported first by index.js, so it
 * must not depend on anything that could itself fail to load.
 */

interface KvStore {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): boolean;
}

export interface CrashRecord {
  message: string;
  stack?: string;
  at: number;
  where: 'startup' | 'screen';
}

const KEY = 'lastCrash.v1';

let store: KvStore | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  store = require('expo-sqlite/kv-store').default as KvStore;
} catch {
  store = null;
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack?.slice(0, 4000) };
  try {
    return { message: typeof error === 'string' ? error : JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function recordCrash(error: unknown, where: CrashRecord['where']): void {
  try {
    store?.setItemSync(KEY, JSON.stringify({ ...describe(error), at: Date.now(), where }));
  } catch {
    // never let crash logging crash the app
  }
}

export function readLastCrash(): CrashRecord | null {
  try {
    const raw = store?.getItemSync(KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}

export function clearLastCrash(): void {
  try {
    store?.removeItemSync(KEY);
  } catch {
    // ignore
  }
}

export function crashReportText(c: CrashRecord): string {
  return [
    'UK LifeDrop AED – error report',
    `When: ${new Date(c.at).toISOString()} (${c.where})`,
    `Error: ${c.message}`,
    c.stack ? `\n${c.stack}` : '',
  ].join('\n');
}

// Install the global handler as early as possible.
type Handler = (error: unknown, isFatal?: boolean) => void;
const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void } })
  .ErrorUtils;
if (errorUtils) {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) recordCrash(error, 'startup');
    previous?.(error, isFatal);
  });
}
