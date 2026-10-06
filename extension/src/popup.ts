import { DEFAULTS, loadSettings } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

(async () => {
  const s = await loadSettings();
  const enabled = $<HTMLInputElement>("enabled");
  const threshold = $<HTMLInputElement>("threshold");
  const backend = $<HTMLInputElement>("backend");
  enabled.checked = s.enabled;
  threshold.value = String(s.threshold);
  $("thVal").textContent = s.threshold.toFixed(2);
  backend.value = s.backendUrl;
  enabled.onchange = () => chrome.storage.local.set({ enabled: enabled.checked });
  threshold.oninput = () => {
    $("thVal").textContent = Number(threshold.value).toFixed(2);
    chrome.storage.local.set({ threshold: Number(threshold.value) });
  };
  backend.onchange = () => chrome.storage.local.set({ backendUrl: backend.value.trim() || DEFAULTS.backendUrl });
})();
