export const RC_PRODUCTION_SHA = '409e416c88f0bd12666302fdaab533a626421a29';

const join = (...parts) => parts.join('');

export const RC_SECRETS = Object.freeze({
  xtreamUsername: join('rc-', 'user-a'),
  xtreamPassword: join('rc-', 'password-a-', 'DO-NOT-LOG'),
  m3uToken: join('rc-', 'm3u-token-', 'DO-NOT-LOG'),
  streamToken: join('rc-', 'stream-token-', 'DO-NOT-LOG'),
});

export const RC_ENDPOINTS = Object.freeze({
  xtreamA: 'https://provider-a.invalid',
  xtreamB: 'https://provider-b.invalid',
  m3uA: `https://m3u-a.invalid/list.m3u?token=${RC_SECRETS.m3uToken}`,
  relay: 'https://relay.invalid',
  phone: 'https://phone.invalid/pair',
});

export const RC_SECRET_CANARIES = Object.freeze([
  RC_SECRETS.xtreamUsername,
  RC_SECRETS.xtreamPassword,
  RC_SECRETS.m3uToken,
  RC_SECRETS.streamToken,
]);

export const RC_XTREAM_PROFILE = Object.freeze({
  user_info: {
    auth: 1,
    status: 'Active',
    username: RC_SECRETS.xtreamUsername,
    account_name: 'RC Provider A',
    exp_date: '1893456000',
    max_connections: '2',
  },
});

export const RC_XTREAM_CATEGORIES = Object.freeze([
  { category_id: '7', category_name: 'Haber' },
  { category_id: '8', category_name: 'Spor' },
]);

export const RC_XTREAM_CHANNELS = Object.freeze([
  {
    stream_id: '42',
    name: 'İstanbul Haber',
    category_id: '7',
    stream_icon: 'https://assets.invalid/news.png',
    num: 1,
    container_extension: 'm3u8',
  },
  {
    stream_id: '43',
    name: 'Şampiyon Spor',
    category_id: '8',
    stream_icon: '',
    num: 2,
    container_extension: 'ts',
  },
]);

export const RC_XTREAM_EPG = Object.freeze({
  epg_listings: [
    {
      stream_id: '42',
      title: 'UkMgSGFiZXI=',
      description: 'U2VudGV0aWsgaGFicg==',
      start_timestamp: 120,
      stop_timestamp: 180,
    },
  ],
});

export const RC_M3U_PLAYLIST = `#EXTM3U\n#EXTINF:-1 tvg-id="rc-news" group-title="Haber" tvg-chno="1",İstanbul Haber\nhttps://stream-a.invalid/live/42.m3u8?token=${RC_SECRETS.streamToken}\n#EXTINF:-1 tvg-id="rc-sports" group-title="Spor" tvg-chno="2",Şampiyon Spor\nhttps://stream-a.invalid/live/43.ts?token=${RC_SECRETS.streamToken}\n`;

export const RC_M3U_MALFORMED = '#EXTM3U\n#EXTINF:-1,Missing URL\n';

export function rcCredentialDocument(providerId = 'rc-provider-a') {
  return JSON.stringify({
    [providerId]: {
      kind: 'xtream',
      serverUrl: RC_ENDPOINTS.xtreamA,
      username: RC_SECRETS.xtreamUsername,
      password: RC_SECRETS.xtreamPassword,
    },
  });
}
