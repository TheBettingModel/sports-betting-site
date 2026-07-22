const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// pnpm monorepo: watch the workspace root so Metro can follow symlinks
// into the pnpm store (node_modules/.pnpm/...)
config.watchFolders = [workspaceRoot];

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
