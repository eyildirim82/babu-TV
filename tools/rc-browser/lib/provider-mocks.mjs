import {
  RC_ENDPOINTS,
  RC_M3U_MALFORMED,
  RC_M3U_PLAYLIST,
  RC_XTREAM_CATEGORIES,
  RC_XTREAM_CHANNELS,
  RC_XTREAM_EPG,
  RC_XTREAM_PROFILE,
} from '../fixtures/common.mjs';
import { sanitizeUrlForEvidence } from './evidence.mjs';

const HTTP_FAILURES = Object.freeze({
  'http-401': 401,
  'http-403': 403,
  'http-404': 404,
  'http-500': 500,
});

function json(route, value, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(value),
  });
}

function text(route, value, contentType = 'text/plain; charset=utf-8', status = 200) {
  return route.fulfill({ status, contentType, body: value });
}

async function failRoute(route, mode, { malformedBody = '{not-json' } = {}) {
  if (mode in HTTP_FAILURES) {
    await text(route, 'synthetic provider failure', 'text/plain; charset=utf-8', HTTP_FAILURES[mode]);
    return true;
  }
  if (mode === 'timeout') {
    await route.abort('timedout');
    return true;
  }
  if (mode === 'abort' || mode === 'transport-failure') {
    await route.abort('failed');
    return true;
  }
  if (mode === 'malformed') {
    await text(route, malformedBody, 'application/json; charset=utf-8');
    return true;
  }
  return false;
}

function defaultState(options = {}) {
  return {
    xtream: {
      profile: options.xtream?.profile ?? 'success',
      categories: options.xtream?.categories ?? 'success',
      streams: options.xtream?.streams ?? 'success',
      epg: options.xtream?.epg ?? 'success',
    },
    m3u: options.m3u ?? 'success',
    playback: options.playback ?? 'success',
    relay: {
      create: options.relay?.create ?? 'success',
      put: options.relay?.put ?? 'success',
      poll: options.relay?.poll ?? 'pending',
    },
  };
}

function recordCall(calls, request, category) {
  calls.push(Object.freeze({
    category,
    method: request.method(),
    url: sanitizeUrlForEvidence(request.url()),
  }));
}

async function installXtreamHost(context, host, state, calls) {
  await context.route(`${host}/**`, async (route) => {
    const request = route.request();
    recordCall(calls, request, 'xtream');
    const url = new URL(request.url());

    if (url.pathname.includes('/live/')) {
      const mode = state.playback;
      if (await failRoute(route, mode)) return;
      if (mode === 'malformed') {
        await text(route, 'not-a-stream');
        return;
      }
      await text(route, '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-ENDLIST\n', 'application/vnd.apple.mpegurl');
      return;
    }

    const action = url.searchParams.get('action');
    const section = action === 'get_live_categories'
      ? 'categories'
      : action === 'get_live_streams'
        ? 'streams'
        : action === 'get_short_epg'
          ? 'epg'
          : 'profile';
    const mode = state.xtream[section];
    if (await failRoute(route, mode)) return;

    if (mode === 'empty') {
      if (section === 'profile') await json(route, {});
      else if (section === 'epg') await json(route, { epg_listings: [] });
      else await json(route, []);
      return;
    }

    if (section === 'profile') await json(route, RC_XTREAM_PROFILE);
    else if (section === 'categories') await json(route, RC_XTREAM_CATEGORIES);
    else if (section === 'streams') await json(route, RC_XTREAM_CHANNELS);
    else await json(route, RC_XTREAM_EPG);
  });
}

async function installM3uHost(context, state, calls) {
  await context.route('https://m3u-a.invalid/**', async (route) => {
    recordCall(calls, route.request(), 'm3u');
    const mode = state.m3u;
    if (await failRoute(route, mode, { malformedBody: RC_M3U_MALFORMED })) return;
    if (mode === 'empty') {
      await text(route, '#EXTM3U\n', 'application/x-mpegURL');
      return;
    }
    await text(route, RC_M3U_PLAYLIST, 'application/x-mpegURL');
  });
}

async function installPlaybackHost(context, state, calls) {
  await context.route('https://stream-a.invalid/**', async (route) => {
    recordCall(calls, route.request(), 'playback');
    if (await failRoute(route, state.playback)) return;
    if (state.playback === 'malformed') {
      await text(route, 'not-a-stream');
      return;
    }
    await text(route, '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-ENDLIST\n', 'application/vnd.apple.mpegurl');
  });
}

async function installRelayHost(context, state, calls) {
  await context.route('https://relay.invalid/**', async (route) => {
    const request = route.request();
    recordCall(calls, request, 'pairing-relay');
    const url = new URL(request.url());
    const isCreate = request.method() === 'POST' && url.pathname === '/v1/pairing/sessions';
    const isPut = request.method() === 'POST' && /\/v1\/pairing\/sessions\/[^/]+\/ciphertext$/.test(url.pathname);
    const isPoll = request.method() === 'GET' && /\/v1\/pairing\/sessions\/[^/]+\/ciphertext$/.test(url.pathname);
    const operation = isCreate ? 'create' : isPut ? 'put' : isPoll ? 'poll' : 'poll';
    const mode = state.relay[operation];

    if (await failRoute(route, mode)) return;
    if (mode === 'malformed') {
      await text(route, '{malformed', 'application/json; charset=utf-8');
      return;
    }

    if (isCreate || isPut) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (isPoll) {
      if (mode === 'ready') await json(route, { status: 'ready', ciphertext: 'rc-ciphertext-envelope' });
      else if (mode === 'expired') await json(route, { status: 'expired' });
      else if (mode === 'consumed') await json(route, { status: 'consumed' });
      else await json(route, { status: 'pending' });
      return;
    }

    await text(route, 'not found', 'text/plain; charset=utf-8', 404);
  });
}

export async function installProviderMocks(context, options = {}) {
  const state = defaultState(options);
  const calls = [];

  await installXtreamHost(context, RC_ENDPOINTS.xtreamA, state, calls);
  await installXtreamHost(context, RC_ENDPOINTS.xtreamB, state, calls);
  await installM3uHost(context, state, calls);
  await installPlaybackHost(context, state, calls);
  await installRelayHost(context, state, calls);

  return Object.freeze({
    calls,
    setXtreamMode(section, mode) {
      if (!(section in state.xtream)) throw new Error('Unsupported Xtream mock section.');
      state.xtream[section] = mode;
    },
    setM3uMode(mode) {
      state.m3u = mode;
    },
    setPlaybackMode(mode) {
      state.playback = mode;
    },
    setRelayMode(operation, mode) {
      if (!(operation in state.relay)) throw new Error('Unsupported relay mock operation.');
      state.relay[operation] = mode;
    },
    setFailedStreamResolution(enabled = true) {
      state.xtream.streams = enabled ? 'empty' : 'success';
    },
    resetCalls() {
      calls.length = 0;
    },
  });
}
