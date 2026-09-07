import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected exactly one match, found ${count}: ${before}`);
  }
  await writeFile(path, source.replace(before, after), 'utf8');
}

await replaceExact(
  'player/src/main.js',
  "import * as player from './player.js';",
  "import * as legacyPlayer from './player.js';\nimport { createPlaybackService } from './playback/playback-service.ts';",
);

await replaceExact(
  'player/src/main.js',
  'const platform = createPlatform(window);',
  'const platform = createPlatform(window);\nconst player = createPlaybackService(legacyPlayer);',
);

await replaceExact(
  'player/src/player.js',
  "import * as avplay from './avplay.js';",
  "import * as legacyAvplay from './avplay.js';\nimport { createAvplayAdapter } from './playback/avplay-adapter.ts';",
);

await replaceExact(
  'player/src/player.js',
  "import { createAvplayAdapter } from './playback/avplay-adapter.ts';\n",
  "import { createAvplayAdapter } from './playback/avplay-adapter.ts';\n\nconst avplay = createAvplayAdapter(legacyAvplay);\n",
);

await replaceExact(
  'player/src/player.js',
  "export function isNativeAvailable() {\n  return avplay.isAvailable();\n}\n\nexport function getPlayer() {",
  "export function isNativeAvailable() {\n  return avplay.isAvailable();\n}\n\nexport function getPlaybackEngine() {\n  if (useAvplay) return 'avplay';\n  return player ? 'shaka' : null;\n}\n\nexport function getPlayer() {",
);
