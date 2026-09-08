import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configUrl = new URL('../../tizen/config.xml', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

void test('Tizen package declares the public WidgetData secure-storage privilege', async () => {
  const config = await readFile(configUrl, 'utf8');

  assert.match(
    config,
    /<tizen:privilege name="http:\/\/developer\.samsung\.com\/privilege\/widgetdata"\s*\/>/,
  );
  assert.doesNotMatch(config, /http:\/\/tizen\.org\/privilege\/keymanager/);
});

void test('Tizen player keeps the Samsung WebAPI bootstrap required by WidgetData', async () => {
  const indexHtml = await readFile(indexUrl, 'utf8');
  assert.match(indexHtml, /\$WEBAPIS\/webapis\/webapis\.js/);
});
