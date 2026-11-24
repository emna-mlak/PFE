const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname)];

// Évite qu'un fichier généré dans .expo relance Fast Refresh juste après le 1er bundle.
config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts ?? ["env", "local", "development"],
};

module.exports = config;
