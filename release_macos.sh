#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Cola Switch"
APP_DIR="$ROOT_DIR/build/$APP_NAME.app"
DIST_DIR="$ROOT_DIR/dist"
ZIP_PATH="$DIST_DIR/${APP_NAME}-macos-arm64.zip"
DMG_PATH="$DIST_DIR/${APP_NAME}-macos-arm64.dmg"
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:-}"
NOTARY_KEYCHAIN_PROFILE="${NOTARY_KEYCHAIN_PROFILE:-}"

cd "$ROOT_DIR"

./build_app.sh
mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH" "$DMG_PATH"

sign_target() {
  local target="$1"
  codesign \
    --force \
    --timestamp \
    --options runtime \
    --sign "$CODESIGN_IDENTITY" \
    "$target"
}

if [[ -n "$CODESIGN_IDENTITY" ]]; then
  echo "Signing app with identity: $CODESIGN_IDENTITY"
  for target in "$APP_DIR/Contents/bin/node" "$APP_DIR/Contents/lib"/*.dylib "$APP_DIR/Contents/MacOS/$APP_NAME"; do
    [[ -e "$target" ]] || continue
    sign_target "$target"
  done
  sign_target "$APP_DIR"
  codesign --verify --deep --strict --verbose=2 "$APP_DIR"
fi

ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

if [[ -n "$NOTARY_KEYCHAIN_PROFILE" ]]; then
  if [[ -z "$CODESIGN_IDENTITY" ]]; then
    echo "NOTARY_KEYCHAIN_PROFILE is set but CODESIGN_IDENTITY is missing."
    exit 1
  fi

  echo "Submitting DMG for notarization with profile: $NOTARY_KEYCHAIN_PROFILE"
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" --wait
  xcrun stapler staple "$APP_DIR"
  xcrun stapler staple "$DMG_PATH"
fi

echo "Release artifacts:"
echo "  $ZIP_PATH"
echo "  $DMG_PATH"
