// Service worker: the only place that talks to the classifier backend, so page CORS never applies
// and the Jev key never reaches the browser (the backend adds it).
import { JevAdapter } from "../../src/engine";
import { loadSettings, type ClassifyRequest, type ClassifyResponse } from "./shared";

chrome.runtime.onMessage.addListener((msg: ClassifyRequest, _sender, send: (r: ClassifyResponse) => void) => {
  if (msg?.type !== "classify") return;
  (async () => {
    try {
      const { backendUrl } = await loadSettings();
      const jev = new JevAdapter({ url: backendUrl, viaProxy: true });
      const dist = await jev.classify(msg.item, msg.candidates);
      send({ ok: true, dist: [...dist], via: dist.via, fellBack: jev.lastFellBack });
    } catch {
      send({ ok: false });
    }
  })();
  return true; // keep the channel open for the async reply
});
