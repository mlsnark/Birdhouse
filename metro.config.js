const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// These packages call requireNativeModule at module init time. On Android the
// native modules aren't available, so stub them out entirely to prevent a
// startup crash. Platform guards in the calling code handle the UX gracefully.
const ANDROID_STUBS = new Set(['expo-image-picker']);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'android' && ANDROID_STUBS.has(moduleName)) {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
