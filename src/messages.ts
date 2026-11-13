import type { CompanyMatch, Status } from './engine/types';
import type { RegisterMeta } from './register/store';

/** Content script or popup -> background worker. */
export type BackgroundRequest =
  | { type: 'match'; names: string[] }
  | { type: 'search'; query: string }
  | { type: 'refresh' }
  | { type: 'status' };

export interface RegisterStatus {
  meta?: RegisterMeta;
  /** Set when the last refresh failed; the old copy is still in use. */
  lastError?: string;
  refreshing: boolean;
}

export type MatchResponse = { matches: Record<string, CompanyMatch>; registerLoaded: boolean };
export type SearchResponse = { names: string[] };

/** Popup -> content script. */
export type ContentRequest = { type: 'counts' };
export type CountsResponse = { counts: Partial<Record<Status, number>>; total: number; entryLevel: number };

/** Background worker -> content scripts. */
export type Broadcast = { type: 'register-updated' };

export const STORAGE = {
  settings: 'settings',
  overrides: 'overrides',
  signals: 'signalCache',
  registerStatus: 'registerStatus',
} as const;
