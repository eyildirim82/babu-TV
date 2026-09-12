import type { LogicalInput } from '../domain/actions.js';
import type { ChannelId, ProviderId, ProviderKind } from '../domain/models.js';
import type { HomeActionIntent } from '../home/home-domain.js';
import type {
  HomeInputAction,
  HomePresentationState,
  HomeViewCallbacks,
} from '../home/home-view.js';
import type {
  FirstRunAction,
  FirstRunCallbacks,
  FirstRunPresentationState,
} from '../first-run/first-run-view.js';
import type {
  XtreamEntryAction,
  XtreamEntryCallbacks,
  XtreamEntrySubmission,
} from '../xtream-entry.js';
import type {
  M3uEntryAction,
  M3uEntryCallbacks,
  M3uEntrySubmission,
} from '../m3u-entry.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { ProviderReentryInput } from '../providers/provider-reentry-service.js';
import type { HomeDataSource } from './home-data-source.js';
import type {
  ProviderManagementSurfaceAction,
  ProviderManagementSurfaceCallbacks,
} from './provider-management-surface.js';

export type AppEntryMode =
  | { kind: 'add' }
  | { kind: 'edit'; providerId: ProviderId };

export type AppRoute =
  | { kind: 'first-run' }
  | { kind: 'home' }
  | { kind: 'live-tv' }
  | { kind: 'provider-management' }
  | { kind: 'legacy-settings'; returnTo: 'provider-management' }
  | { kind: 'pairing'; returnTo: 'first-run' | 'provider-management' }
  | {
      kind: 'xtream-entry';
      returnTo: 'first-run' | 'provider-management';
      mode: AppEntryMode;
    }
  | {
      kind: 'm3u-entry';
      returnTo: 'first-run' | 'provider-management';
      mode: AppEntryMode;
    };

export type AppRemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'channelUp'
  | 'channelDown'
  | 'digit'
  | 'number'
  | 'playpause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'prev'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'reload'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute';

export interface AppHomeViewPort {
  show(state: HomePresentationState): void;
  setState(state: HomePresentationState): void;
  hide(): void;
  handleAction(action: HomeInputAction): void;
}

export interface AppFirstRunViewPort {
  show(state?: FirstRunPresentationState): void;
  hide(): void;
  handleAction(action: FirstRunAction): void;
}

export interface AppPairingViewPort {
  show(): Promise<void>;
  hide(): void;
  handleBack(): void;
}

export interface AppEntryViewPort<Action extends string> {
  show(): void;
  hide(): void;
  handleAction(action: Action): void;
}

export interface AppProviderManagementCallbacks extends ProviderManagementSurfaceCallbacks {
  onAddProvider(): void;
  onEditProvider(providerId: ProviderId, kind: ProviderKind): void;
}

export interface AppProviderManagementPort {
  show(): Promise<void>;
  hide(): void;
  handleAction(action: ProviderManagementSurfaceAction): Promise<void>;
}

export interface AppProviderReentryPort {
  reenter(input: ProviderReentryInput): Promise<unknown>;
}

export interface AppLiveTvControllerPort {
  openScope(scope: { kind: 'all' } | { kind: 'favorites' }): void;
  openChannel(channelId: ChannelId): void;
  playChannel(channelId: ChannelId): Promise<void>;
  handleInput(input: LogicalInput): Promise<void>;
}

export type AppLiveTvStart =
  | {
      mode: 'm3';
      controller: AppLiveTvControllerPort;
      enterProvider(providerId: ProviderId): Promise<void>;
    }
  | { mode: 'legacy' };

export interface AppCompositionDependencies {
  providers: Pick<ProviderRepository, 'listProviders' | 'getActiveProviderId'>;
  core: {
    switchActiveProvider(providerId: ProviderId): Promise<void>;
  };
  homeData: HomeDataSource;
  views: {
    home(callbacks: HomeViewCallbacks): AppHomeViewPort;
    firstRun(callbacks: FirstRunCallbacks): AppFirstRunViewPort;
    xtream(callbacks: XtreamEntryCallbacks): AppEntryViewPort<XtreamEntryAction>;
    m3u(callbacks: M3uEntryCallbacks): AppEntryViewPort<M3uEntryAction>;
    providerManagement(callbacks: AppProviderManagementCallbacks): AppProviderManagementPort;
  };
  pairing?: {
    view(callbacks: {
      onBack(): void;
      onCompleted(providerId: ProviderId): void;
    }): AppPairingViewPort;
  };
  onboarding: {
    connectXtream(input: XtreamEntrySubmission): Promise<void>;
    connectM3u(input: M3uEntrySubmission): Promise<void>;
  };
  reentry: AppProviderReentryPort;
  liveTv: {
    start(onRootBack: () => void): Promise<AppLiveTvStart>;
  };
  legacy: {
    hidePlayerShell(): void;
    showPlayerShell?(): void;
    openPlayer(): void;
    showSettings(): void;
    hideSettings(): void;
    handleRemote(action: AppRemoteAction, value?: number): void;
  };
  exitApp(): void;
}

const HOME_ACTIONS = new Set<HomeInputAction>([
  'left',
  'right',
  'up',
  'down',
  'select',
  'back',
]);

const ENTRY_ACTIONS = new Set<XtreamEntryAction>([
  'up',
  'down',
  'select',
  'back',
]);

const M3_ACTIONS = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  select: 'SELECT',
  back: 'BACK',
  channelUp: 'CHANNEL_UP',
  channelDown: 'CHANNEL_DOWN',
  next: 'CHANNEL_DOWN',
  prev: 'CHANNEL_UP',
} as const;

type AppM3LiveTvRuntime = Extract<AppLiveTvStart, { mode: 'm3' }>;

export class AppComposition {
  private currentRoute: AppRoute = { kind: 'first-run' };
  private readonly homeView: AppHomeViewPort;
  private readonly firstRunView: AppFirstRunViewPort;
  private readonly pairingView: AppPairingViewPort | null;
  private readonly xtreamView: AppEntryViewPort<XtreamEntryAction>;
  private readonly m3uView: AppEntryViewPort<M3uEntryAction>;
  private readonly providerView: AppProviderManagementPort;
  private liveTvRuntime: AppM3LiveTvRuntime | null = null;
  private liveTvMode: 'm3' | 'legacy' | null = null;
  private liveTvProviderId: ProviderId | null = null;
  private firstRunReturnTo: 'legacy' | 'provider-management' = 'legacy';

  constructor(private readonly deps: AppCompositionDependencies) {
    this.pairingView = deps.pairing?.view({
      onBack: () => { void this.returnFromPairing(); },
      onCompleted: () => { void this.showHome(); },
    }) ?? null;
    this.homeView = deps.views.home({
      onIntent: (intent) => { void this.handleHomeIntent(intent); },
      onBack: () => deps.exitApp(),
    });
    this.firstRunView = deps.views.firstRun({
      onXtreamSelected: () => {
        this.showXtream(this.firstRunDestination(), { kind: 'add' });
      },
      onM3uSelected: () => {
        this.showM3u(this.firstRunDestination(), { kind: 'add' });
      },
      ...(this.pairingView !== null
        ? { onPairingSelected: () => { void this.showPairing(this.firstRunDestination()); } }
        : {}),
      onBack: () => { void this.handleFirstRunBack(); },
    });
    this.xtreamView = deps.views.xtream({
      onSubmit: async (input) => {
        const route = this.currentRoute;
        if (route.kind === 'xtream-entry' && route.mode.kind === 'edit') {
          await deps.reentry.reenter({
            providerId: route.mode.providerId,
            kind: 'xtream',
            ...input,
          });
          await this.showProviderManagement();
          return;
        }
        await deps.onboarding.connectXtream(input);
        await this.showHome();
      },
      onBack: () => { void this.returnFromEntry(); },
    });
    this.m3uView = deps.views.m3u({
      onSubmit: async (input) => {
        const route = this.currentRoute;
        if (route.kind === 'm3u-entry' && route.mode.kind === 'edit') {
          await deps.reentry.reenter({
            providerId: route.mode.providerId,
            kind: 'm3u',
            playlistUrl: input.playlistUrl,
          });
          await this.showProviderManagement();
          return;
        }
        await deps.onboarding.connectM3u(input);
        await this.showHome();
      },
      onBack: () => { void this.returnFromEntry(); },
    });
    this.providerView = deps.views.providerManagement({
      onBack: () => { void this.showHome(); },
      onOpenLegacySettings: () => { this.showLegacySettings(); },
      onAddProvider: () => { this.showProviderChooser('provider-management'); },
      onEditProvider: (providerId, kind) => { this.showProviderEdit(providerId, kind); },
    });
  }

  route(): AppRoute {
    return this.currentRoute;
  }

  async boot(): Promise<void> {
    const providers = await this.deps.providers.listProviders();
    if (providers.length === 0) {
      this.showProviderChooser('legacy');
      return;
    }
    await this.showHome();
  }

  async handleHomeIntent(intent: HomeActionIntent): Promise<void> {
    switch (intent.type) {
      case 'SELECT_PROVIDER':
        await this.deps.core.switchActiveProvider(intent.providerId);
        await this.showHome();
        return;
      case 'OPEN_LIVE_TV':
        await this.openLiveTv(intent.providerId, (controller) => {
          controller.openScope({ kind: intent.scope });
        });
        return;
      case 'OPEN_LIVE_TV_CHANNEL':
        await this.openLiveTv(intent.providerId, (controller) => {
          controller.openChannel(intent.channelId);
        });
        return;
      case 'PLAY_CHANNEL':
        await this.openLiveTv(intent.providerId, async (controller) => {
          await controller.playChannel(intent.channelId);
        });
        return;
      case 'OPEN_SETTINGS':
        await this.showProviderManagement();
    }
  }

  async handleRemote(action: AppRemoteAction, value?: number): Promise<void> {
    if (action === 'back') {
      await this.handleBack();
      return;
    }

    switch (this.currentRoute.kind) {
      case 'home':
        if (HOME_ACTIONS.has(action as HomeInputAction)) {
          this.homeView.handleAction(action as HomeInputAction);
        }
        return;
      case 'first-run':
        if (HOME_ACTIONS.has(action as FirstRunAction)) {
          this.firstRunView.handleAction(action as FirstRunAction);
        }
        return;
      case 'xtream-entry':
        if (ENTRY_ACTIONS.has(action as XtreamEntryAction)) {
          this.xtreamView.handleAction(action as XtreamEntryAction);
        }
        return;
      case 'm3u-entry':
        if (ENTRY_ACTIONS.has(action as M3uEntryAction)) {
          this.m3uView.handleAction(action as M3uEntryAction);
        }
        return;
      case 'provider-management':
        if (action === 'up' || action === 'down' || action === 'select') {
          await this.providerView.handleAction(action);
        }
        return;
      case 'pairing':
        return;
      case 'legacy-settings':
        this.deps.legacy.handleRemote(action, value);
        return;
      case 'live-tv':
        if (this.liveTvMode === 'legacy' || this.liveTvRuntime === null) {
          this.deps.legacy.handleRemote(action, value);
          return;
        }
        await this.handleM3Remote(action, value);
    }
  }

  private async showHome(): Promise<void> {
    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = { kind: 'home' };
    this.homeView.show({ kind: 'loading' });
    try {
      this.homeView.setState({
        kind: 'ready',
        model: await this.deps.homeData.load(),
      });
    } catch {
      this.homeView.setState({
        kind: 'error',
        message: 'Ana sayfa yüklenemedi.',
      });
    }
  }

  private showProviderChooser(returnTo: 'legacy' | 'provider-management'): void {
    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.hidePlayerShell();
    this.firstRunReturnTo = returnTo;
    this.currentRoute = { kind: 'first-run' };
    this.firstRunView.show({ kind: 'empty' });
  }

  private async showPairing(returnTo: 'first-run' | 'provider-management'): Promise<void> {
    if (this.pairingView === null) return;
    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = { kind: 'pairing', returnTo };
    await this.pairingView.show();
  }

  private async showProviderManagement(): Promise<void> {
    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = { kind: 'provider-management' };
    await this.providerView.show();
  }

  private showLegacySettings(): void {
    this.hideModernViews();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = {
      kind: 'legacy-settings',
      returnTo: 'provider-management',
    };
    this.deps.legacy.showSettings();
  }

  private showXtream(
    returnTo: 'first-run' | 'provider-management',
    mode: AppEntryMode,
  ): void {
    this.hideModernViews();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = { kind: 'xtream-entry', returnTo, mode };
    this.xtreamView.show();
  }

  private showM3u(
    returnTo: 'first-run' | 'provider-management',
    mode: AppEntryMode,
  ): void {
    this.hideModernViews();
    this.deps.legacy.hidePlayerShell();
    this.currentRoute = { kind: 'm3u-entry', returnTo, mode };
    this.m3uView.show();
  }

  private showProviderEdit(providerId: ProviderId, kind: ProviderKind): void {
    const mode: AppEntryMode = { kind: 'edit', providerId };
    if (kind === 'xtream') {
      this.showXtream('provider-management', mode);
      return;
    }
    this.showM3u('provider-management', mode);
  }

  private async openLiveTv(
    providerId: ProviderId,
    activate: (controller: AppLiveTvControllerPort) => void | Promise<void>,
  ): Promise<void> {
    await this.ensureProvider(providerId);

    let runtime = this.liveTvRuntime;
    if (runtime === null) {
      const started = await this.deps.liveTv.start(() => {
        void this.showHome();
      });
      this.liveTvMode = started.mode;
      this.liveTvProviderId = providerId;
      if (started.mode === 'legacy') {
        this.hideModernViews();
        this.deps.legacy.hideSettings();
        this.deps.legacy.showPlayerShell?.();
        this.currentRoute = { kind: 'live-tv' };
        this.deps.legacy.openPlayer();
        return;
      }
      this.liveTvRuntime = started;
      runtime = started;
    } else if (this.liveTvProviderId !== providerId) {
      try {
        await runtime.enterProvider(providerId);
      } catch {
        return;
      }
      this.liveTvProviderId = providerId;
    }

    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.showPlayerShell?.();
    this.currentRoute = { kind: 'live-tv' };
    await activate(runtime.controller);
  }

  private async ensureProvider(providerId: ProviderId): Promise<void> {
    const activeProviderId = await this.deps.providers.getActiveProviderId();
    if (activeProviderId !== providerId) {
      await this.deps.core.switchActiveProvider(providerId);
    }
  }

  private async handleBack(): Promise<void> {
    switch (this.currentRoute.kind) {
      case 'home':
        this.deps.exitApp();
        return;
      case 'provider-management':
        await this.showHome();
        return;
      case 'legacy-settings':
        this.deps.legacy.hideSettings();
        await this.showProviderManagement();
        return;
      case 'xtream-entry':
      case 'm3u-entry':
        await this.returnFromEntry();
        return;
      case 'first-run':
        await this.handleFirstRunBack();
        return;
      case 'pairing':
        this.pairingView?.handleBack();
        return;
      case 'live-tv':
        if (this.liveTvMode === 'legacy' || this.liveTvRuntime === null) {
          this.deps.legacy.handleRemote('back');
          return;
        }
        await this.liveTvRuntime.controller.handleInput({ type: 'ACTION', action: 'BACK' });
    }
  }

  private async handleFirstRunBack(): Promise<void> {
    if (this.firstRunReturnTo === 'provider-management') {
      await this.showProviderManagement();
      return;
    }
    this.hideModernViews();
    this.deps.legacy.showPlayerShell?.();
    this.currentRoute = { kind: 'live-tv' };
    this.liveTvMode = 'legacy';
    this.liveTvRuntime = null;
    this.liveTvProviderId = null;
    this.deps.legacy.openPlayer();
  }

  private async returnFromPairing(): Promise<void> {
    const route = this.currentRoute;
    if (route.kind !== 'pairing') return;
    if (route.returnTo === 'provider-management') {
      await this.showProviderManagement();
      return;
    }
    this.showProviderChooser('legacy');
  }

  private async returnFromEntry(): Promise<void> {
    const route = this.currentRoute;
    if (route.kind !== 'xtream-entry' && route.kind !== 'm3u-entry') return;
    if (route.returnTo === 'provider-management') {
      await this.showProviderManagement();
      return;
    }
    this.showProviderChooser('legacy');
  }

  private firstRunDestination(): 'first-run' | 'provider-management' {
    return this.firstRunReturnTo === 'provider-management'
      ? 'provider-management'
      : 'first-run';
  }

  private async handleM3Remote(action: AppRemoteAction, value?: number): Promise<void> {
    if (this.liveTvRuntime === null) return;
    if (action === 'digit') {
      if (Number.isInteger(value) && value !== undefined && value >= 0 && value <= 9) {
        await this.liveTvRuntime.controller.handleInput({ type: 'DIGIT', digit: value });
      }
      return;
    }
    const logicalAction = M3_ACTIONS[action as keyof typeof M3_ACTIONS];
    if (logicalAction !== undefined) {
      await this.liveTvRuntime.controller.handleInput({ type: 'ACTION', action: logicalAction });
    }
  }

  private hideModernViews(): void {
    this.homeView.hide();
    this.firstRunView.hide();
    this.pairingView?.hide();
    this.xtreamView.hide();
    this.m3uView.hide();
    this.providerView.hide();
  }
}

export function createAppComposition(deps: AppCompositionDependencies): AppComposition {
  return new AppComposition(deps);
}
