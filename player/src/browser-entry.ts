import { tryStartPairingPhoneBrowserRoute } from './pairing/phone-browser-entry.js';
import './ui/pairing-phone.css';

async function bootBrowser(): Promise<void> {
  const pairingPhoneStarted = await tryStartPairingPhoneBrowserRoute({
    hash: window.location.hash,
    document,
    fetchImpl: window.fetch.bind(window),
  });
  if (pairingPhoneStarted) return;

  await import('./main.js');
}

void bootBrowser();
