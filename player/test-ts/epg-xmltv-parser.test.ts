import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeXmlText,
  parseXmltvPrograms,
  parseXmltvTimestamp,
} from '../src/epg/xmltv-parser.js';

test('EPG-XML parses explicit XMLTV offsets to epoch milliseconds', () => {
  assert.equal(
    parseXmltvTimestamp('20260910150000 +0300'),
    Date.UTC(2026, 8, 10, 12, 0, 0),
  );
  assert.equal(parseXmltvTimestamp('20260910150000'), null);
  assert.equal(parseXmltvTimestamp('20260231150000 +0300'), null);
  assert.equal(parseXmltvTimestamp('20261310150000 +0300'), null);
});

test('EPG-XML decodes XML entities and CDATA text', () => {
  assert.equal(decodeXmlText('A &amp; B &#304;'), 'A & B İ');
  assert.equal(decodeXmlText('<![CDATA[A < B]]>'), 'A < B');
  assert.equal(decodeXmlText('&lt;&gt;&quot;&apos;&#x130;'), '<>"\'İ');
  assert.equal(decodeXmlText('&unknown;'), '&unknown;');
});

test('EPG-XML extracts programme channel, interval, title, and description', () => {
  const xml = `<?xml version="1.0"?>
    <tv>
      <programme start="20260910150000 +0300" stop="20260910153000 +0300" channel="trt1.tr">
        <title lang="tr">Haberler</title>
        <desc>Günün &amp; gündemin özeti</desc>
      </programme>
    </tv>`;

  assert.deepEqual(parseXmltvPrograms(xml), [{
    sourceChannel: { providerChannelId: null, tvgId: 'trt1.tr', name: null },
    startMs: Date.UTC(2026, 8, 10, 12, 0, 0),
    endMs: Date.UTC(2026, 8, 10, 12, 30, 0),
    title: 'Haberler',
    description: 'Günün & gündemin özeti',
  }]);
});

test('EPG-XML skips malformed siblings and accepts single quotes with negative offsets', () => {
  const xml = `<tv>
    <programme start='20260231150000 +0300' stop='20260910153000 +0300' channel='bad'>
      <title>Bad date</title>
    </programme>
    <programme start='20260910150000 -0400' stop='20260910153000 -0400' channel='news&amp;world'>
      <title><![CDATA[News < World]]></title>
    </programme>
  </tv>`;

  assert.deepEqual(parseXmltvPrograms(xml), [{
    sourceChannel: { providerChannelId: null, tvgId: 'news&world', name: null },
    startMs: Date.UTC(2026, 8, 10, 19, 0, 0),
    endMs: Date.UTC(2026, 8, 10, 19, 30, 0),
    title: 'News < World',
    description: null,
  }]);
});
