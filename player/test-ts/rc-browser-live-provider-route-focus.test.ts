import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderManagementPresenter } from '../src/provider-management/provider-management-presenter.js';
import { ProviderManagementSurface } from '../src/app/provider-management-surface.js';

class FakeElement {
  id = '';
  tagName: string;
  textContent = '';
  className = '';
  type = '';
  disabled = false;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attributes = new Map<string, string>();
  ownerDocument: FakeDocument;

  constructor(tag: string, document: FakeDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
  }

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  focus() { this.ownerDocument.activeElement = this; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  body = new FakeElement('body', this);

  createElement(tag: string) { return new FakeElement(tag, this); }

  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeElement): FakeElement | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.body);
  }
}

function asDocument(document: FakeDocument): Document {
  return document as unknown as Document;
}

void test('provider Add route keeps focus on the newly mounted First Run surface', async () => {
  const document = new FakeDocument();
  const presenter = new ProviderManagementPresenter({
    async load() {
      return {
        providers: [{ id: 'p1', kind: 'xtream' as const, name: 'One' }],
        activeProviderId: 'p1',
      };
    },
    async switchProvider() {},
    requestEditProvider() {},
    async deleteProvider() {},
    requestAddProvider() {
      document.getElementById('provider-management-page')?.remove();
      const firstRun = document.createElement('button');
      firstRun.id = 'first-run-xtream';
      document.body.appendChild(firstRun);
      firstRun.focus();
    },
  });
  const surface = new ProviderManagementSurface(asDocument(document), presenter, {
    onBack() {},
    onOpenLegacySettings() {},
  });

  await surface.show();
  assert.equal(document.activeElement?.id, 'provider:p1:switch');

  await surface.handleAction('down');
  await surface.handleAction('down');
  await surface.handleAction('down');
  assert.equal(document.activeElement?.id, 'add-provider');

  await surface.handleAction('select');

  assert.equal(document.getElementById('provider-management-page'), null);
  assert.equal(document.activeElement?.id, 'first-run-xtream');
});
