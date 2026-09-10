import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeXmlText,
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
