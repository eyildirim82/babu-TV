import { RC_ENDPOINTS, RC_SECRETS } from './common.mjs';

export const PLAYNAV_PROVIDER_A = 'rc-playnav-provider-a';
export const PLAYNAV_PROVIDER_B = 'rc-playnav-provider-b';
export const PLAYNAV_CHANNEL_IDS = Object.freeze(['42', '43', '44']);

const MEDIA_MPD = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<MPD xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n\txmlns=\"urn:mpeg:dash:schema:mpd:2011\"\n\txmlns:xlink=\"http://www.w3.org/1999/xlink\"\n\txsi:schemaLocation=\"urn:mpeg:DASH:schema:MPD:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd\"\n\tprofiles=\"urn:mpeg:dash:profile:isoff-live:2011\"\n\ttype=\"static\"\n\tmediaPresentationDuration=\"PT1.0S\"\n\tmaxSegmentDuration=\"PT1.0S\"\n\tminBufferTime=\"PT2.0S\">\n\t<ProgramInformation>\n\t</ProgramInformation>\n\t<ServiceDescription id=\"0\">\n\t</ServiceDescription>\n\t<Period id=\"0\" start=\"PT0.0S\">\n\t\t<AdaptationSet id=\"0\" contentType=\"video\" startWithSAP=\"1\" segmentAlignment=\"true\" bitstreamSwitching=\"true\" frameRate=\"5/1\" maxWidth=\"64\" maxHeight=\"36\" par=\"16:9\">\n\t\t\t<Representation id=\"0\" mimeType=\"video/webm\" codecs=\"vp09.00.10.08\" bandwidth=\"5000\" width=\"64\" height=\"36\" sar=\"1:1\">\n\t\t\t\t<SegmentTemplate timescale=\"1000\" initialization=\"init-stream$RepresentationID$.webm\" media=\"chunk-stream$RepresentationID$-$Number%05d$.webm\" startNumber=\"1\">\n\t\t\t\t\t<SegmentTimeline>\n\t\t\t\t\t\t<S t=\"0\" d=\"1000\" />\n\t\t\t\t\t</SegmentTimeline>\n\t\t\t\t</SegmentTemplate>\n\t\t\t</Representation>\n\t\t</AdaptationSet>\n\t</Period>\n</MPD>\n";
const MEDIA_ASSETS = Object.freeze({
  'init-stream0.webm': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDMWVK5ryK4BAAAAAAAAP9eBAXPFiEp+W1sMbQnhnIEAIrWcg3VuZIiBAIaFVl9WUDmDgQEj44OEC+vCAOCQsIFAuoEkmoECVbCEVbmBARJUw2eic3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwMw==',
  'chunk-stream0-00001.webm': 'H0O2dfzngQCjo4EAAICCSYNCAAPwAjYAOCQcGEIAADBgAAATv//9ZrxAAAAAo5OBAMgAhgBAkpwASUAAAyAAAFRwo5OBAZAAhgBAkpwASsAAAyAAAFRwo5OBAlgAhgBAkpwAScAAAyAAAFRwo5OBAyAAhgBAkpwASKAAAyAAAFRw',
});

function providerHost(providerId) {
  if (providerId === PLAYNAV_PROVIDER_A) return RC_ENDPOINTS.xtreamA;
  if (providerId === PLAYNAV_PROVIDER_B) return RC_ENDPOINTS.xtreamB;
  throw new Error(`Unsupported BROW-PLAYNAV provider: ${providerId}`);
}

function streamName(providerId, channelId) {
  const prefix = providerId === PLAYNAV_PROVIDER_A ? 'A' : 'B';
  if (channelId === '42') return `${prefix} İstanbul Haber`;
  if (channelId === '43') return `${prefix} Şampiyon Spor`;
  return `${prefix} Çocuk 44`;
}

function categoryId(channelId) {
  return channelId === '43' ? '8' : '7';
}

function streamRecord(providerId, channelId, index) {
  return {
    stream_id: channelId,
    name: streamName(providerId, channelId),
    category_id: categoryId(channelId),
    stream_icon: '',
    num: index + 1,
    container_extension: 'mpd',
  };
}

function catalogFor(providerId, channelIds = PLAYNAV_CHANNEL_IDS) {
  return channelIds.map((channelId, index) => streamRecord(providerId, channelId, index));
}

function normalizedChannels(providerId, channelIds = PLAYNAV_CHANNEL_IDS) {
  return channelIds.map((channelId, index) => ({
    key: `${providerId}:${channelId}`,
    providerId,
    id: channelId,
    name: streamName(providerId, channelId),
    categoryId: categoryId(channelId),
    logoUrl: null,
    number: index + 1,
  }));
}

function normalizedCategories(providerId) {
  return [
    { key: `${providerId}:7`, providerId, id: '7', name: 'Haber' },
    { key: `${providerId}:8`, providerId, id: '8', name: 'Spor' },
  ];
}

function credential(providerId, serverUrl) {
  return {
    kind: 'xtream',
    serverUrl,
    username: RC_SECRETS.xtreamUsername,
    password: RC_SECRETS.xtreamPassword,
  };
}

export function playNavCredentialDocument() {
  return JSON.stringify({
    [PLAYNAV_PROVIDER_A]: credential(PLAYNAV_PROVIDER_A, RC_ENDPOINTS.xtreamA),
    [PLAYNAV_PROVIDER_B]: credential(PLAYNAV_PROVIDER_B, RC_ENDPOINTS.xtreamB),
  });
}

export async function seedPlayNavState(page, options = {}) {
  const activeProviderId = options.activeProviderId ?? PLAYNAV_PROVIDER_A;
  const providerAChannels = options.providerAChannels ?? PLAYNAV_CHANNEL_IDS;
  const providerBChannels = options.providerBChannels ?? PLAYNAV_CHANNEL_IDS;
  const nowMs = options.nowMs ?? Date.now();

  await page.evaluate(async (input) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('babustv', 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('providers')) {
          database.createObjectStore('providers', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('categories')) {
          const store = database.createObjectStore('categories', { keyPath: 'key' });
          store.createIndex('providerId', 'providerId', { unique: false });
        }
        if (!database.objectStoreNames.contains('channels')) {
          const store = database.createObjectStore('channels', { keyPath: 'key' });
          store.createIndex('providerId', 'providerId', { unique: false });
        }
        if (!database.objectStoreNames.contains('app_state')) {
          database.createObjectStore('app_state', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('epg_programs')) {
          const store = database.createObjectStore('epg_programs', { keyPath: 'key' });
          store.createIndex('providerId', 'providerId', { unique: false });
          store.createIndex('providerChannelKey', 'providerChannelKey', { unique: false });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        ['providers', 'categories', 'channels', 'app_state', 'epg_programs'],
        'readwrite',
      );
      const providers = tx.objectStore('providers');
      const categories = tx.objectStore('categories');
      const channels = tx.objectStore('channels');
      const appState = tx.objectStore('app_state');
      const epg = tx.objectStore('epg_programs');

      providers.clear();
      categories.clear();
      channels.clear();
      appState.clear();
      epg.clear();

      for (const provider of input.providers) providers.put(provider);
      for (const category of input.categories) categories.put(category);
      for (const channel of input.channels) channels.put(channel);
      appState.put({ key: 'activeProviderId', value: input.activeProviderId });

      if (input.seedWatchState) {
        appState.put({
          key: `user.watch.last:${JSON.stringify(input.providerAId)}`,
          kind: 'user.watch.last.v1',
          providerId: input.providerAId,
          channelId: '42',
          lastPlayedAtMs: input.nowMs - 60_000,
        });
        appState.put({
          key: `user.watch.aggregate:${JSON.stringify([input.providerAId, '42'])}`,
          kind: 'user.watch.aggregate.v1',
          providerId: input.providerAId,
          channelId: '42',
          meaningfulWatchMs: 60_000,
          meaningfulOpenCount: 1,
          lastMeaningfulWatchAtMs: input.nowMs - 60_000,
        });
      }

      if (input.seedEpg) {
        for (const providerId of [input.providerAId, input.providerBId]) {
          const providerChannelKey = JSON.stringify([providerId, '42']);
          epg.put({
            key: JSON.stringify([
              providerId,
              '42',
              input.nowMs - 60_000,
              input.nowMs + 10 * 60_000,
              `${providerId} current`,
              `${providerId} browser qualification`,
              0,
            ]),
            providerId,
            providerChannelKey,
            channelId: '42',
            startMs: input.nowMs - 60_000,
            endMs: input.nowMs + 10 * 60_000,
            title: `${providerId} current`,
            description: `${providerId} browser qualification`,
          });
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, {
    activeProviderId,
    providerAId: PLAYNAV_PROVIDER_A,
    providerBId: PLAYNAV_PROVIDER_B,
    nowMs,
    seedEpg: options.seedEpg !== false,
    seedWatchState: options.seedWatchState === true,
    providers: [
      {
        id: PLAYNAV_PROVIDER_A,
        kind: 'xtream',
        name: 'RC Provider A',
        createdAtMs: nowMs - 120_000,
        lastSuccessfulSyncAtMs: nowMs - 60_000,
      },
      {
        id: PLAYNAV_PROVIDER_B,
        kind: 'xtream',
        name: 'RC Provider B',
        createdAtMs: nowMs - 120_000,
        lastSuccessfulSyncAtMs: nowMs - 60_000,
      },
    ],
    categories: [
      ...normalizedCategories(PLAYNAV_PROVIDER_A),
      ...normalizedCategories(PLAYNAV_PROVIDER_B),
    ],
    channels: [
      ...normalizedChannels(PLAYNAV_PROVIDER_A, providerAChannels),
      ...normalizedChannels(PLAYNAV_PROVIDER_B, providerBChannels),
    ],
  });
}

export async function readPlayNavWatchState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('babustv', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction('app_state', 'readonly');
      const request = tx.objectStore('app_state').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return records
      .filter((record) => typeof record?.kind === 'string' && record.kind.startsWith('user.watch.'))
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  });
}

export async function dispatchSpecialRemoteKey(page, key) {
  await page.evaluate((value) => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
    }));
  }, key);
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function providerState() {
  return {
    catalog: [...PLAYNAV_CHANNEL_IDS],
    queue: [],
    streamListCalls: 0,
    manifestFailureByChannel: new Map(),
  };
}

export async function installPlayNavNetwork(context) {
  const states = new Map([
    [PLAYNAV_PROVIDER_A, providerState()],
    [PLAYNAV_PROVIDER_B, providerState()],
  ]);
  const calls = [];

  for (const providerId of [PLAYNAV_PROVIDER_A, PLAYNAV_PROVIDER_B]) {
    const host = providerHost(providerId);

    await context.route(`${host}/player_api.php**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') !== 'get_live_streams') {
        await route.fallback();
        return;
      }

      const state = states.get(providerId);
      state.streamListCalls += 1;
      calls.push(Object.freeze({
        kind: 'stream-list',
        providerId,
        call: state.streamListCalls,
      }));

      const queued = state.queue.shift() ?? null;
      if (queued?.gate) await queued.gate.promise;
      const channelIds = queued?.channelIds ?? state.catalog;
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(catalogFor(providerId, channelIds)),
      });
    });

    await context.route(`${host}/live/**`, async (route) => {
      const url = new URL(route.request().url());
      const filename = url.pathname.split('/').pop() ?? '';
      const manifestMatch = filename.match(/^([^/]+)\.mpd$/);
      if (manifestMatch) {
        const channelId = decodeURIComponent(manifestMatch[1]);
        calls.push(Object.freeze({ kind: 'manifest', providerId, channelId }));
        const mode = states.get(providerId).manifestFailureByChannel.get(channelId) ?? 'success';
        if (mode === 'abort') {
          await route.abort('failed');
          return;
        }
        if (mode === 'http-500') {
          await route.fulfill({
            status: 500,
            contentType: 'text/plain; charset=utf-8',
            body: 'synthetic stream failure',
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/dash+xml; charset=utf-8',
          body: MEDIA_MPD,
        });
        return;
      }

      const asset = MEDIA_ASSETS[filename];
      if (asset !== undefined) {
        calls.push(Object.freeze({ kind: 'media-segment', providerId, asset: filename }));
        await route.fulfill({
          status: 200,
          contentType: 'video/webm',
          body: Buffer.from(asset, 'base64'),
        });
        return;
      }

      await route.fallback();
    });
  }

  return Object.freeze({
    calls,
    setCatalog(providerId, channelIds) {
      const state = states.get(providerId);
      if (!state) throw new Error('Unknown play-nav provider.');
      state.catalog = [...channelIds];
    },
    queueNextCatalog(providerId, channelIds) {
      const state = states.get(providerId);
      if (!state) throw new Error('Unknown play-nav provider.');
      state.queue.push({ channelIds: [...channelIds], gate: null });
    },
    holdNextCatalog(providerId, channelIds) {
      const state = states.get(providerId);
      if (!state) throw new Error('Unknown play-nav provider.');
      const gate = deferred();
      state.queue.push({ channelIds: [...channelIds], gate });
      return Object.freeze({
        release() {
          gate.resolve();
        },
      });
    },
    setManifestFailure(providerId, channelId, mode = 'success') {
      const state = states.get(providerId);
      if (!state) throw new Error('Unknown play-nav provider.');
      if (mode === 'success') state.manifestFailureByChannel.delete(channelId);
      else if (mode === 'abort' || mode === 'http-500') {
        state.manifestFailureByChannel.set(channelId, mode);
      } else {
        throw new Error('Unsupported manifest failure mode.');
      }
    },
    streamListCallCount(providerId) {
      return states.get(providerId)?.streamListCalls ?? 0;
    },
  });
}
