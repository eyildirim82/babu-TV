import {
  RC_ENDPOINTS,
  RC_SECRETS,
  RC_XTREAM_PROFILE,
} from './common.mjs';

export const PACK_B_CHANNEL_IDS = Object.freeze({
  shared: '500',
  istanbul: '501',
  latinI: '502',
  dotlessI: '503',
  lowerI: '504',
  sCedilla: '505',
  gBreve: '506',
  uUmlaut: '507',
  oUmlaut: '508',
  cCedilla: '509',
  sports: '510',
});

export const PACK_B_PROVIDER_KEYS = Object.freeze({
  A: 'a',
  B: 'b',
});

const CATEGORIES_A = Object.freeze([
  { category_id: 'news', category_name: 'Haber' },
  { category_id: 'turkish', category_name: 'Türkçe' },
  { category_id: 'sports', category_name: 'Spor' },
]);

const CHANNELS_A = Object.freeze([
  { stream_id: PACK_B_CHANNEL_IDS.shared, name: 'Ortak Kanal A', category_id: 'news', stream_icon: '', num: 1, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.istanbul, name: 'İstanbul', category_id: 'turkish', stream_icon: '', num: 2, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.latinI, name: 'Ihlamur', category_id: 'turkish', stream_icon: '', num: 3, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.dotlessI, name: 'ılık', category_id: 'turkish', stream_icon: '', num: 4, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.lowerI, name: 'izmir', category_id: 'turkish', stream_icon: '', num: 5, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.sCedilla, name: 'Şeker', category_id: 'turkish', stream_icon: '', num: 6, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.gBreve, name: 'Ğölge', category_id: 'turkish', stream_icon: '', num: 7, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.uUmlaut, name: 'Üsküdar', category_id: 'turkish', stream_icon: '', num: 8, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.oUmlaut, name: 'Öykü', category_id: 'turkish', stream_icon: '', num: 9, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.cCedilla, name: 'Çınar', category_id: 'turkish', stream_icon: '', num: 10, container_extension: 'm3u8' },
  { stream_id: PACK_B_CHANNEL_IDS.sports, name: 'Spor Bir', category_id: 'sports', stream_icon: '', num: 11, container_extension: 'm3u8' },
]);

const CATEGORIES_B = Object.freeze([
  { category_id: 'news-b', category_name: 'Haber B' },
  { category_id: 'other-b', category_name: 'Diğer B' },
]);

const CHANNELS_B = Object.freeze([
  { stream_id: PACK_B_CHANNEL_IDS.shared, name: 'Ortak Kanal B', category_id: 'news-b', stream_icon: '', num: 1, container_extension: 'm3u8' },
  { stream_id: '601', name: 'İstanbul B', category_id: 'news-b', stream_icon: '', num: 2, container_extension: 'm3u8' },
  { stream_id: '602', name: 'Bağımsız B', category_id: 'other-b', stream_icon: '', num: 3, container_extension: 'm3u8' },
]);

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function providerState(key) {
  if (key === PACK_B_PROVIDER_KEYS.A) {
    return {
      endpoint: RC_ENDPOINTS.xtreamA,
      categories: cloneRows(CATEGORIES_A),
      channels: cloneRows(CHANNELS_A),
      epgMode: 'success',
      streamGate: null,
    };
  }
  return {
    endpoint: RC_ENDPOINTS.xtreamB,
    categories: cloneRows(CATEGORIES_B),
    channels: cloneRows(CHANNELS_B),
    epgMode: 'success',
    streamGate: null,
  };
}

function epgPayload(streamId, mode) {
  if (mode === 'empty') return { epg_listings: [] };
  if (mode === 'malformed') return { epg_listings: [{ stream_id: streamId, title: 7, start_timestamp: 'bad', stop_timestamp: null }] };

  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    epg_listings: [
      {
        stream_id: streamId,
        title: Buffer.from(`Şimdi ${streamId}`, 'utf8').toString('base64'),
        description: Buffer.from(`Geçerli program ${streamId}`, 'utf8').toString('base64'),
        start_timestamp: nowSeconds - 600,
        stop_timestamp: nowSeconds + 600,
      },
      {
        stream_id: streamId,
        title: Buffer.from(`Sonraki ${streamId}`, 'utf8').toString('base64'),
        description: Buffer.from(`Sıradaki program ${streamId}`, 'utf8').toString('base64'),
        start_timestamp: nowSeconds + 600,
        stop_timestamp: nowSeconds + 1800,
      },
    ],
  };
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function handleXtreamRoute(route, state) {
  const url = new URL(route.request().url());
  if (url.pathname !== '/player_api.php') {
    await route.fallback();
    return;
  }

  const action = url.searchParams.get('action');
  if (action === null) {
    await json(route, RC_XTREAM_PROFILE);
    return;
  }
  if (action === 'get_live_categories') {
    await json(route, state.categories);
    return;
  }
  if (action === 'get_live_streams') {
    if (state.streamGate !== null) await state.streamGate.promise;
    await json(route, state.channels);
    return;
  }
  if (action === 'get_short_epg') {
    if (state.epgMode === 'http-500') {
      await json(route, { error: 'synthetic epg failure' }, 500);
      return;
    }
    await json(route, epgPayload(url.searchParams.get('stream_id') ?? '', state.epgMode));
    return;
  }

  await route.fallback();
}

export function createPackBLiveFixture() {
  const states = {
    [PACK_B_PROVIDER_KEYS.A]: providerState(PACK_B_PROVIDER_KEYS.A),
    [PACK_B_PROVIDER_KEYS.B]: providerState(PACK_B_PROVIDER_KEYS.B),
  };

  return {
    endpoint(key) {
      return states[key].endpoint;
    },

    credentials() {
      return {
        username: RC_SECRETS.xtreamUsername,
        password: RC_SECRETS.xtreamPassword,
      };
    },

    catalog(key) {
      return {
        categories: cloneRows(states[key].categories),
        channels: cloneRows(states[key].channels),
      };
    },

    setChannels(key, channels) {
      states[key].channels = cloneRows(channels);
    },

    setCategories(key, categories) {
      states[key].categories = cloneRows(categories);
    },

    pauseStreams(key) {
      if (states[key].streamGate !== null) throw new Error(`Pack B stream refresh already paused for ${key}`);
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      states[key].streamGate = { promise };
      return () => {
        const gate = states[key].streamGate;
        states[key].streamGate = null;
        if (gate !== null) release();
      };
    },

    setEpgMode(key, mode) {
      if (!['success', 'empty', 'malformed', 'http-500'].includes(mode)) {
        throw new Error(`Unsupported Pack B EPG mode: ${mode}`);
      }
      states[key].epgMode = mode;
    },

    reset(key) {
      states[key] = providerState(key);
    },

    async install(context) {
      await context.route(`${RC_ENDPOINTS.xtreamA}/**`, (route) => handleXtreamRoute(route, states[PACK_B_PROVIDER_KEYS.A]));
      await context.route(`${RC_ENDPOINTS.xtreamB}/**`, (route) => handleXtreamRoute(route, states[PACK_B_PROVIDER_KEYS.B]));
    },
  };
}
