import { STATUS_LABEL, type Status } from '../engine/types';
import type { BackgroundRequest, ContentRequest, CountsResponse, RegisterStatus } from '../messages';
import { getSettings, saveSettings } from '../storage';

const ORDER: Status[] = ['sponsors', 'possible', 'unlikely', 'unknown', 'no', 'not_licensed'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function showCounts(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const request: ContentRequest = { type: 'counts' };
  const response =
    tab?.id === undefined ? undefined : ((await chrome.tabs.sendMessage(tab.id, request).catch(() => undefined)) as CountsResponse | undefined);

  const list = $('counts');
  list.replaceChildren();
  if (!response || response.total === 0) {
    $('counts-empty').hidden = false;
    return;
  }
  $('counts-empty').hidden = true;
  const row = (pillClass: string, label: string, n: number) => {
    const dt = document.createElement('dt');
    const pill = document.createElement('span');
    pill.className = `pill ${pillClass}`;
    pill.textContent = label;
    dt.appendChild(pill);
    const dd = document.createElement('dd');
    dd.textContent = String(n);
    list.append(dt, dd);
  };
  for (const status of ORDER) {
    const n = response.counts[status];
    if (n) row(status, STATUS_LABEL[status], n);
  }
  if (response.entryLevel) row('entry', 'Entry level', response.entryLevel);
}

function showRegister(status: RegisterStatus | undefined): void {
  const meta = $('register-meta');
  const error = $('register-error');
  const button = $<HTMLButtonElement>('refresh');

  button.disabled = status?.refreshing ?? false;
  button.textContent = status?.refreshing ? 'Refreshing…' : 'Refresh register';

  if (status?.meta) {
    const date = new Date(status.meta.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    meta.textContent = `Updated ${date} · ${status.meta.count.toLocaleString('en-GB')} Skilled Worker sponsors`;
  } else {
    meta.textContent = status?.refreshing ? 'Downloading the register for the first time…' : 'Not downloaded yet.';
  }

  error.hidden = !status?.lastError;
  error.textContent = status?.lastError ? `Last refresh failed: ${status.lastError}${status.meta ? ' Using the saved copy.' : ''}` : '';
}

const ask = (request: BackgroundRequest) => chrome.runtime.sendMessage(request).catch(() => undefined) as Promise<RegisterStatus | undefined>;

async function init(): Promise<void> {
  const settings = await getSettings();
  for (const key of ['hide', 'hideAgency'] as const) {
    const box = $<HTMLInputElement>(key);
    box.checked = settings[key];
    box.addEventListener('change', () => void saveSettings({ [key]: box.checked }));
  }

  $('refresh').addEventListener('click', async () => {
    showRegister({ ...(await ask({ type: 'status' })), refreshing: true });
    showRegister(await ask({ type: 'refresh' }));
    void showCounts();
  });
  $('open-settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());

  showRegister(await ask({ type: 'status' }));
  await showCounts();
}

void init();
