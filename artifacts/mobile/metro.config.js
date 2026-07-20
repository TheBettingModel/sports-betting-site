const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @tailwindcss/typography creates _tmp_* directories during CSS processing
// that are deleted before Metro can finish watching them, causing ENOENT crashes.
// Exclude those transient paths from the file watcher.
config.resolver = {
  ...config.resolver,
  blockList: [
    /node_modules\/.pnpm\/.*\/node_modules\/@tailwindcss\/typography_tmp_[^/]+\/.*/,
    /node_modules\/.*\/@tailwindcss\/typography_tmp_[^/]+\/.*/,
  ],
};

module.exports = config;
