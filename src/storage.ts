import { DEFAULT_SETTINGS, EMPTY_OVERRIDES, type Overrides, type Settings } from './engine/types';
import { STORAGE } from './messages';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [STORAGE.settings]: next });
  return next;
}

export async function getOverrides(): Promise<Overrides> {
  const stored = await chrome.storage.local.get(STORAGE.overrides);
  const o = stored[STORAGE.overrides] as Partial<Overrides> | undefined;
  return { companies: { ...EMPTY_OVERRIDES.companies, ...o?.companies }, jobs: { ...EMPTY_OVERRIDES.jobs, ...o?.jobs } };
}

export async function saveOverrides(overrides: Overrides): Promise<void> {
  await chrome.storage.local.set({ [STORAGE.overrides]: overrides });
}
