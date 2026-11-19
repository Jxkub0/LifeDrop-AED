// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The bundled national defibrillator snapshot (assets/data/aeds-gb.dat) ships as a raw asset.
config.resolver.assetExts.push('dat');

module.exports = config;
