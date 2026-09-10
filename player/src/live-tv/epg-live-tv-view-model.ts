export interface EpgLiveTvViewModel {
  channelContext: readonly [];
  selected: null;
}

export async function buildEpgLiveTvViewModel(): Promise<EpgLiveTvViewModel> {
  return {
    channelContext: [],
    selected: null,
  };
}
