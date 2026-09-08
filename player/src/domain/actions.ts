export type LogicalAction =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'SELECT'
  | 'BACK'
  | 'OPTIONS'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN';

export type LogicalInput =
  | { type: 'ACTION'; action: LogicalAction }
  | { type: 'DIGIT'; digit: number };

export type FocusZone = 'HOME' | 'CATEGORY' | 'CHANNEL' | 'ACTIONS' | 'SETTINGS';

export interface FocusState {
  screen: 'ONBOARDING' | 'HOME' | 'LIVE_TV' | 'SETTINGS';
  zone: FocusZone;
  itemId: string | null;
  restoreItemId: string | null;
}
