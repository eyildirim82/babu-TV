export const PRODUCT_IDENTITY = Object.freeze({
  productName: 'BabuşTV',
  displayName: 'BABUŞ TV',
  widgetId: 'https://babus.tv/babustvapp',
  packageId: 'BabusTVApp',
  applicationId: 'BabusTVApp.BabusTV',
  authorName: 'BABUS',
  authorUrl: 'https://babus.tv',
  browserBase: '/babustv/',
});

export function artifactName({ version, commit, channel }) {
  if (channel !== 'stable' && channel !== 'beta') {
    throw new TypeError(`Unsupported release channel: ${channel}`);
  }
  return `babustv_${channel}_v${version}_${commit}.wgt`;
}
