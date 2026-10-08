// Expo's default config already understands npm workspaces (it watches the monorepo
// root and resolves hoisted packages), so the shared package works without extra setup.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
