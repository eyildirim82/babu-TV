import type {
  XtreamEntryAction,
  XtreamEntryCallbacks,
  XtreamEntrySubmission,
} from './xtream-entry.js';
import type { XtreamOnboardingService } from './providers/xtream-onboarding-service.js';

export interface XtreamOnboardingPort {
  connect(input: XtreamEntrySubmission): ReturnType<XtreamOnboardingService['connect']>;
}

export interface XtreamEntryIntegrationDependencies {
  onboarding: XtreamOnboardingPort;
  reload(): void;
  onBack(): void;
}

export function createXtreamEntryCallbacks(
  deps: XtreamEntryIntegrationDependencies,
): XtreamEntryCallbacks {
  return {
    async onSubmit(input) {
      await deps.onboarding.connect(input);
      deps.reload();
    },
    onBack: deps.onBack,
  };
}

export interface XtreamEntryRouteView {
  isVisible(): boolean;
  handleAction(action: XtreamEntryAction): void;
}

export function routeXtreamEntryAction(
  view: XtreamEntryRouteView,
  action: string,
): boolean {
  if (!view.isVisible()) return false;

  if (action === 'up' || action === 'down' || action === 'select' || action === 'back') {
    view.handleAction(action);
  }

  return true;
}
