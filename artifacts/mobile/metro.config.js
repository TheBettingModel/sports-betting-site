const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// pnpm monorepo: watch the workspace root so Metro can follow symlinks
// into the pnpm store (node_modules/.pnpm/...)
config.watchFolders = [workspaceRoot];

// Override the transform profile to "default" so that Babel fully downlevels
// private class fields (#x, #y, etc.) before hermesc sees them. The Linux
// hermesc binary bundled with RN 0.81 does not support native private fields,
// even though the iOS/Android Hermes runtimes do. "hermes-stable" (expo default)
// skips that transform assuming Hermes handles it; "default" applies it explicitly.
config.transformer = {
  ...config.transformer,
  unstable_transformProfile: 'default',
};

config.resolver = {
  ...config.resolver,
  // Allow Metro to resolve packages from the workspace root node_modules
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
  // Follow symlinks created by pnpm
  unstable_enableSymlinks: true,
  blockList: [
    /node_modules\/.pnpm\/.*\/node_modules\/@tailwindcss\/typography_tmp_[^/]+\/.*/,
    /node_modules\/.*\/@tailwindcss\/typography_tmp_[^/]+\/.*/,
    /node_modules\/.pnpm\/react-native-purchases[^/]*\/node_modules\/react-native-purchases_tmp_[^/]+\/.*/,
    /node_modules\/.*\/react-native-purchases_tmp_[^/]+\/.*/,
    // Block skill temp/old directories so stale/partial dirs never crash the watcher
    /\.local\/skills\/.tmp-artifacts-.*/,
    /\.local\/skills\/.*\/.tmp-.*/,
    /\.local\/skills\/\.old-.*/,
    /\.local\/skills\/\..*/,
  ],
};

module.exports = config;
