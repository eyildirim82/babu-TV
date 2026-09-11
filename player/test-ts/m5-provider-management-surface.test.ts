import test from 'node:test';
import assert from 'node:assert/strict';
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

test('M5 provider surface cancels delete confirmation before leaving the route', async () => {
  const events: string[] = [];
  const presenter = new ProviderManagementPresenter({
    async load() {
      return {
        providers: [{ id: 'p1', kind: 'xtream' as const, name: 'One' }],
        activeProviderId: 'p1',
      };
    },
    async switchProvider() { events.push('switch'); },
    async deleteProvider() { events.push('delete'); },
    requestAddProvider() { events.push('add'); },
  });
  const document = new FakeDocument();
  const surface = new ProviderManagementSurface(asDocument(document), presenter, {
    onBack: () => events.push('back'),
    onOpenLegacySettings: () => events.push('legacy-settings'),
  });

  await surface.show();
  assert.ok(document.getElementById('provider-management-page'));
  assert.equal(presenter.state.focusedId, 'provider:p1:switch');

  await surface.handleAction('down');
  assert.equal(presenter.state.focusedId, 'provider:p1:delete');
  await surface.handleAction('select');
  assert.notEqual(presenter.state.confirmation, null);
  assert.ok(document.getElementById('cancel-delete'));
  assert.ok(document.getElementById('confirm-delete'));

  await surface.handleAction('back');
  assert.equal(presenter.state.confirmation, null);
  assert.equal(presenter.state.focusedId, 'provider:p1:delete');
  assert.equal(events.includes('back'), false);
});

test('M5 provider surface exposes existing app settings as a separate trailing action', async () => {
  const events: string[] = [];
  const presenter = new ProviderManagementPresenter({
    async load() { return { providers: [], activeProviderId: null }; },
    async switchProvider() {},
    async deleteProvider() {},
    requestAddProvider() { events.push('add'); },
  });
  const document = new FakeDocument();
  const surface = new ProviderManagementSurface(asDocument(document), presenter, {
    onBack: () => events.push('back'),
    onOpenLegacySettings: () => events.push('legacy-settings'),
  });

  await surface.show();
  assert.equal(presenter.state.focusedId, 'add-provider');
  await surface.handleAction('down');
  assert.equal(document.activeElement?.id, 'app-settings');
  await surface.handleAction('select');
  assert.deepEqual(events, ['legacy-settings']);
});
