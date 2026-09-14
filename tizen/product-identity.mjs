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

// Tizen widget versions are numeric x.y.z (x, y <= 255; z <= 65535), so a
// semver prerelease or build suffix from package.json must not reach config.xml.
export function tizenWidgetVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version));
  const parts = match ? match.slice(1, 4).map(Number) : [];
  if (!match || parts[0] > 255 || parts[1] > 255 || parts[2] > 65535) {
    throw new TypeError(`Unsupported Tizen widget version: ${version}`);
  }
  return parts.join('.');
}

export function artifactName({ version, commit, channel }) {
  if (channel !== 'stable' && channel !== 'beta') {
    throw new TypeError(`Unsupported release channel: ${channel}`);
  }
  return `babustv_${channel}_v${version}_${commit}.wgt`;
}
