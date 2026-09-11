import type { ProviderId, ProviderKind, ProviderSummary } from '../domain/models.js';

export interface ProviderManagementSnapshot {
  providers: readonly ProviderSummary[];
  activeProviderId: ProviderId | null;
}

export interface ProviderManagementOperations {
  load(): Promise<ProviderManagementSnapshot>;
  switchProvider(providerId: ProviderId): Promise<void>;
  requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
  requestAddProvider(): void | Promise<void>;
}

export type ProviderManagementStatus = 'loading' | 'ready' | 'empty' | 'error';
export type ProviderManagementDirection = 'previous' | 'next';
export type ProviderManagementBusyAction = 'switch' | 'delete' | null;

export interface ProviderManagementProviderItem {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
  isActive: boolean;
  switchFocusId: string;
  editFocusId: string;
  deleteFocusId: string;
}

export interface ProviderDeleteConfirmation {
  providerId: ProviderId;
  providerName: string;
}

export interface ProviderManagementState {
  status: ProviderManagementStatus;
  providers: readonly ProviderManagementProviderItem[];
  activeProviderId: ProviderId | null;
  focusOrder: readonly string[];
  focusedId: string | null;
  confirmation: ProviderDeleteConfirmation | null;
  errorMessage: string | null;
  busyAction: ProviderManagementBusyAction;
}

const ADD_PROVIDER_FOCUS_ID = 'add-provider';
const CANCEL_DELETE_FOCUS_ID = 'cancel-delete';
const CONFIRM_DELETE_FOCUS_ID = 'confirm-delete';
const DELETE_CONFIRMATION_FOCUS_ORDER = [CANCEL_DELETE_FOCUS_ID, CONFIRM_DELETE_FOCUS_ID] as const;

function switchFocusId(providerId: ProviderId): string {
  return `provider:${providerId}:switch`;
}

function editFocusId(providerId: ProviderId): string {
  return `provider:${providerId}:edit`;
}

function deleteFocusId(providerId: ProviderId): string {
  return `provider:${providerId}:delete`;
}

function clampMove(order: readonly string[], focusedId: string | null, direction: ProviderManagementDirection): string | null {
  if (order.length === 0) return null;
  const currentIndex = focusedId === null ? -1 : order.indexOf(focusedId);
  if (currentIndex < 0) return order[0] ?? null;
  const delta = direction === 'next' ? 1 : -1;
  const targetIndex = Math.max(0, Math.min(order.length - 1, currentIndex + delta));
  return order[targetIndex] ?? null;
}

function initialState(): ProviderManagementState {
  return {
    status: 'loading',
    providers: [],
    activeProviderId: null,
    focusOrder: [],
    focusedId: null,
    confirmation: null,
    errorMessage: null,
    busyAction: null,
  };
}

export class ProviderManagementPresenter {
  private view: ProviderManagementState = initialState();

  constructor(private readonly operations: ProviderManagementOperations) {}

  get state(): ProviderManagementState {
    return this.view;
  }

  async load(preferredFocusId: string | null = null): Promise<void> {
    const previousFocusId = preferredFocusId ?? this.view.focusedId;
    this.view = {
      ...this.view,
      status: 'loading',
      errorMessage: null,
      busyAction: null,
    };

    try {
      const snapshot = await this.operations.load();
      const providers = snapshot.providers.map((provider): ProviderManagementProviderItem => ({
        id: provider.id,
        kind: provider.kind,
        name: provider.name,
        isActive: provider.id === snapshot.activeProviderId,
        switchFocusId: switchFocusId(provider.id),
        editFocusId: editFocusId(provider.id),
        deleteFocusId: deleteFocusId(provider.id),
      }));
      const focusOrder = providers.flatMap((provider) => [
        provider.switchFocusId,
        provider.editFocusId,
        provider.deleteFocusId,
      ]);
      focusOrder.push(ADD_PROVIDER_FOCUS_ID);

      const activeFocusId = snapshot.activeProviderId === null
        ? null
        : switchFocusId(snapshot.activeProviderId);
      const focusedId = previousFocusId !== null && focusOrder.includes(previousFocusId)
        ? previousFocusId
        : activeFocusId !== null && focusOrder.includes(activeFocusId)
          ? activeFocusId
          : providers[0]?.switchFocusId ?? ADD_PROVIDER_FOCUS_ID;

      this.view = {
        status: providers.length === 0 ? 'empty' : 'ready',
        providers,
        activeProviderId: snapshot.activeProviderId,
        focusOrder,
        focusedId,
        confirmation: null,
        errorMessage: null,
        busyAction: null,
      };
    } catch {
      this.view = {
        status: 'error',
        providers: [],
        activeProviderId: null,
        focusOrder: [ADD_PROVIDER_FOCUS_ID],
        focusedId: ADD_PROVIDER_FOCUS_ID,
        confirmation: null,
        errorMessage: 'Sağlayıcılar yüklenemedi.',
        busyAction: null,
      };
    }
  }

  moveFocus(direction: ProviderManagementDirection): void {
    const order = this.view.confirmation === null
      ? this.view.focusOrder
      : DELETE_CONFIRMATION_FOCUS_ORDER;
    this.view = {
      ...this.view,
      focusedId: clampMove(order, this.view.focusedId, direction),
    };
  }

  async activateFocused(): Promise<void> {
    if (this.view.busyAction !== null) return;

    if (this.view.confirmation !== null) {
      if (this.view.focusedId === CANCEL_DELETE_FOCUS_ID) {
        this.cancelDelete();
      } else if (this.view.focusedId === CONFIRM_DELETE_FOCUS_ID) {
        await this.confirmDelete();
      }
      return;
    }

    if (this.view.focusedId === ADD_PROVIDER_FOCUS_ID) {
      await this.operations.requestAddProvider();
      return;
    }

    const switchTarget = this.view.providers.find((provider) => provider.switchFocusId === this.view.focusedId);
    if (switchTarget !== undefined) {
      await this.switchProvider(switchTarget.id);
      return;
    }

    const editTarget = this.view.providers.find((provider) => provider.editFocusId === this.view.focusedId);
    if (editTarget !== undefined) {
      try {
        await this.operations.requestEditProvider(editTarget.id, editTarget.kind);
        this.view = {
          ...this.view,
          errorMessage: null,
        };
      } catch {
        this.view = {
          ...this.view,
          focusedId: editTarget.editFocusId,
          errorMessage: 'Sağlayıcı düzenleme açılamadı.',
        };
      }
      return;
    }

    const deleteTarget = this.view.providers.find((provider) => provider.deleteFocusId === this.view.focusedId);
    if (deleteTarget !== undefined) {
      this.view = {
        ...this.view,
        confirmation: {
          providerId: deleteTarget.id,
          providerName: deleteTarget.name,
        },
        focusedId: CANCEL_DELETE_FOCUS_ID,
        errorMessage: null,
      };
    }
  }

  private cancelDelete(): void {
    const confirmation = this.view.confirmation;
    if (confirmation === null) return;
    const restoredFocusId = deleteFocusId(confirmation.providerId);
    this.view = {
      ...this.view,
      confirmation: null,
      focusedId: this.view.focusOrder.includes(restoredFocusId)
        ? restoredFocusId
        : this.view.focusOrder[0] ?? null,
      errorMessage: null,
    };
  }

  private async switchProvider(providerId: ProviderId): Promise<void> {
    const preferredFocusId = switchFocusId(providerId);
    this.view = {
      ...this.view,
      busyAction: 'switch',
      errorMessage: null,
    };

    try {
      await this.operations.switchProvider(providerId);
      this.view = { ...this.view, busyAction: null };
      await this.load(preferredFocusId);
    } catch {
      this.view = {
        ...this.view,
        busyAction: null,
        focusedId: preferredFocusId,
        errorMessage: 'Sağlayıcı değiştirilemedi.',
      };
    }
  }

  private async confirmDelete(): Promise<void> {
    const confirmation = this.view.confirmation;
    if (confirmation === null) return;

    const providerIndex = this.view.providers.findIndex((provider) => provider.id === confirmation.providerId);
    const fallbackProvider = this.view.providers[providerIndex + 1]
      ?? this.view.providers[providerIndex - 1]
      ?? null;
    const preferredFocusId = fallbackProvider?.switchFocusId ?? ADD_PROVIDER_FOCUS_ID;

    this.view = {
      ...this.view,
      busyAction: 'delete',
      errorMessage: null,
    };

    try {
      await this.operations.deleteProvider(confirmation.providerId);
      this.view = {
        ...this.view,
        confirmation: null,
        busyAction: null,
      };
      await this.load(preferredFocusId);
    } catch {
      this.view = {
        ...this.view,
        busyAction: null,
        focusedId: CONFIRM_DELETE_FOCUS_ID,
        errorMessage: 'Sağlayıcı silinemedi.',
      };
    }
  }
}
