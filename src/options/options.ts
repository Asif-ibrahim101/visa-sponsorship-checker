import { STATUS_LABEL, type FloorMode, type Overrides, type Settings } from '../engine/types';
import { STORAGE } from '../messages';
import { getOverrides, getSettings, saveOverrides, saveSettings } from '../storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

let savedTimer: number | undefined;
function flashSaved(): void {
  $('saved').hidden = false;
  window.clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => ($('saved').hidden = true), 1200);
}

async function save(patch: Partial<Settings>): Promise<void> {
  await saveSettings(patch);
  flashSaved();
}

function bindSettings(settings: Settings): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="floorMode"]')) {
    radio.checked = radio.value === settings.floorMode;
    radio.addEventListener('change', () => radio.checked && void save({ floorMode: radio.value as FloorMode }));
  }

  for (const key of ['newEntrantFloor', 'generalFloor', 'customFloor'] as const) {
    const input = $<HTMLInputElement>(key);
    input.value = String(settings[key]);
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (Number.isFinite(value) && value >= 0) void save({ [key]: value });
      else input.value = String(settings[key]);
    });
  }

  for (const key of ['extraPositive', 'extraNegative'] as const) {
    const area = $<HTMLTextAreaElement>(key);
    area.value = settings[key].join('\n');
    area.addEventListener('change', () => void save({ [key]: lines(area.value) }));
  }

  for (const key of ['dimming', 'hideAgency'] as const) {
    const box = $<HTMLInputElement>(key);
    box.checked = settings[key];
    box.addEventListener('change', () => void save({ [key]: box.checked }));
  }

  const opacity = $<HTMLInputElement>('opacity');
  const showOpacity = () => ($('opacity-value').textContent = `${Math.round(Number(opacity.value) * 100)}%`);
  opacity.value = String(settings.opacity);
  showOpacity();
  opacity.addEventListener('input', showOpacity);
  opacity.addEventListener('change', () => void save({ opacity: Number(opacity.value) }));
}

function renderOverrides(overrides: Overrides): void {
  const list = $('overrides');
  list.replaceChildren();

  const row = (text: string, remove: () => void) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = text;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Remove';
    button.addEventListener('click', async () => {
      remove();
      await saveOverrides(overrides);
      flashSaved();
    });
    li.append(span, button);
    list.appendChild(li);
  };

  for (const [company, o] of Object.entries(overrides.companies)) {
    const what = o.kind === 'sponsors' ? 'sponsors' : o.kind === 'no' ? "doesn't sponsor" : `linked to ${o.registerName}`;
    row(`${company}: ${what}`, () => delete overrides.companies[company]);
  }
  for (const [jobId, status] of Object.entries(overrides.jobs)) {
    row(`Job ${jobId}: ${STATUS_LABEL[status]}`, () => delete overrides.jobs[jobId]);
  }
  $('overrides-empty').hidden = list.childElementCount > 0;
}

async function init(): Promise<void> {
  bindSettings(await getSettings());
  renderOverrides(await getOverrides());
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE.overrides]) void getOverrides().then(renderOverrides);
  });
}

void init();
