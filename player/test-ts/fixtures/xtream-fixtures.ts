export const XTREAM_ACTIVE_PROFILE = {
  user_info: {
    auth: 1,
    status: 'Active',
    username: 'demo-user',
    account_name: 'Demo Account',
    exp_date: '1893456000',
    max_connections: '2',
  },
};

export const XTREAM_AUTH_DENIED = {
  user_info: {
    auth: 0,
    status: 'Disabled',
    username: 'demo-user',
  },
};

export const XTREAM_EXPIRED_PROFILE = {
  user_info: {
    auth: 1,
    status: 'Expired',
    username: 'demo-user',
  },
};

export const XTREAM_CATEGORIES = [
  { category_id: '7', category_name: ' News ' },
  { category_id: 8, category_name: 'Sports' },
  { category_id: '', category_name: 'Broken' },
  { category_id: '9', category_name: '' },
  null,
];

export const XTREAM_CHANNELS = [
  {
    stream_id: 42,
    name: ' Example News ',
    category_id: '7',
    stream_icon: 'https://example.com/logo.png',
    num: 1,
    container_extension: 'm3u8',
  },
  {
    stream_id: '43',
    name: 'Example Sports',
    category_id: 8,
    stream_icon: '',
    num: '2',
    container_extension: 'ts',
  },
  {
    stream_id: 42,
    name: 'Duplicate Should Lose',
    category_id: '99',
    stream_icon: 'https://example.com/duplicate.png',
    num: 99,
    container_extension: 'mp4',
  },
  {
    stream_id: 44,
    name: 'Unsafe Extension',
    category_id: null,
    stream_icon: null,
    num: 0,
    container_extension: '../secret',
  },
  { stream_id: null, name: 'Missing ID' },
  { stream_id: 45, name: '' },
  null,
];
