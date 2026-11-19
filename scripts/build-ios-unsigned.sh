#!/usr/bin/env bash
# Builds an UNSIGNED iPhone app (.ipa) for sideloading (Sideloadly, AltStore, etc.).
# The sideloading tool signs it with your own Apple ID when it installs it.
# Needs a Mac with Xcode 26+ and CocoaPods (or run the GitHub Actions workflow instead).
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci
CI=1 npx expo prebuild --platform ios --clean
(cd ios && pod install)

rm -rf build/ios && mkdir -p build/ios
xcodebuild \
  -workspace ios/UKLifeDropAED.xcworkspace \
  -scheme UKLifeDropAED \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/ios/UKLifeDropAED.xcarchive \
  -skipPackagePluginValidation \
  archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" DEVELOPMENT_TEAM=""

mkdir -p build/ios/Payload
cp -R build/ios/UKLifeDropAED.xcarchive/Products/Applications/UKLifeDropAED.app build/ios/Payload/
(cd build/ios && zip -qry "UK-LifeDrop-AED-$(node -p "require('../../package.json').version")-unsigned.ipa" Payload)
ls -lh build/ios/*.ipa
