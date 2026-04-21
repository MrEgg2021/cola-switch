#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Cola Switch"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
BACKUP_DIR="$BUILD_DIR/${APP_NAME}.bak-$(date +%Y%m%d-%H%M%S)"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
BIN_DIR="$CONTENTS_DIR/bin"
LIB_DIR="$CONTENTS_DIR/lib"
EXECUTABLE_PATH="$MACOS_DIR/$APP_NAME"
NODE_PATH_OVERRIDE="${NODE_PATH_OVERRIDE:-}"

NODE_PATH="$NODE_PATH_OVERRIDE"
if [[ -z "$NODE_PATH" ]]; then
  NODE_PATH="$(command -v node || true)"
fi

if [[ -z "$NODE_PATH" ]]; then
  echo "node not found"
  exit 1
fi

mkdir -p "$BUILD_DIR"

if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "$BACKUP_DIR"
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$BIN_DIR" "$LIB_DIR"

cp "$ROOT_DIR/index.html" "$RESOURCES_DIR/index.html"
cp "$ROOT_DIR/styles.css" "$RESOURCES_DIR/styles.css"
cp "$ROOT_DIR/script.js" "$RESOURCES_DIR/script.js"
cp "$ROOT_DIR/server.js" "$RESOURCES_DIR/server.js"
printf "%s\n" "$NODE_PATH" > "$RESOURCES_DIR/node-path.txt"

copy_bundled_node_runtime() {
  local source_node="$NODE_PATH"
  local bundled_node="$BIN_DIR/node"
  local node_prefix=""
  local -a libnode_candidates=()
  local libnode_source=""
  local queue_file dep_file
  local target dep base replacement dep_source
  local current_line=1
  local total_lines=0

  cp "$source_node" "$bundled_node"
  chmod 755 "$bundled_node"

  queue_file="$(mktemp)"
  dep_file="$(mktemp)"
  printf "%s\n" "$bundled_node" > "$queue_file"

  node_prefix="$(brew --prefix node 2>/dev/null || true)"
  if [[ -n "$node_prefix" ]]; then
    libnode_candidates=("$node_prefix"/lib/libnode*.dylib(N))
  fi
  if (( ${#libnode_candidates[@]} == 0 )); then
    libnode_candidates=(/opt/homebrew/lib/libnode*.dylib(N) /opt/homebrew/opt/node/lib/libnode*.dylib(N))
  fi
  if (( ${#libnode_candidates[@]} > 0 )); then
    libnode_source="${libnode_candidates[1]}"
    cp "$libnode_source" "$LIB_DIR/${libnode_source:t}"
    chmod 755 "$LIB_DIR/${libnode_source:t}"
    printf "%s\n" "$LIB_DIR/${libnode_source:t}" >> "$queue_file"
  fi

  while true; do
    total_lines="$(wc -l < "$queue_file" | tr -d ' ')"
    if (( current_line > total_lines )); then
      break
    fi
    target="$(sed -n "${current_line}p" "$queue_file")"
    current_line=$((current_line + 1))
    [[ -n "$target" ]] || continue
    otool -L "$target" | tail -n +2 | awk '{print $1}' > "$dep_file"
    while IFS= read -r dep; do
      if [[ "$dep" == /opt/homebrew/* ]]; then
        base="${dep:t}"
        if [[ ! -e "$LIB_DIR/$base" ]]; then
          cp "$dep" "$LIB_DIR/$base"
          chmod 755 "$LIB_DIR/$base"
          printf "%s\n" "$LIB_DIR/$base" >> "$queue_file"
        fi
        continue
      fi

      if [[ "$dep" == @loader_path/* || "$dep" == @rpath/* ]]; then
        base="${dep:t}"
        if [[ ! -e "$LIB_DIR/$base" ]]; then
          dep_source="$(find /opt/homebrew -name "$base" -print -quit 2>/dev/null || true)"
          if [[ -n "$dep_source" && -e "$dep_source" ]]; then
            cp "$dep_source" "$LIB_DIR/$base"
            chmod 755 "$LIB_DIR/$base"
            printf "%s\n" "$LIB_DIR/$base" >> "$queue_file"
          fi
        fi
      fi
    done < "$dep_file"
  done

  if [[ -e "$LIB_DIR/libnode.141.dylib" ]]; then
    install_name_tool -id "@rpath/libnode.141.dylib" "$LIB_DIR/libnode.141.dylib"
  fi

  for target in "$LIB_DIR"/*(.N); do
    base="${target:t}"
    if [[ "$base" != "libnode.141.dylib" ]]; then
      install_name_tool -id "@loader_path/$base" "$target"
    fi
  done

  for target in "$bundled_node" "$LIB_DIR"/*(.N); do
    [[ -e "$target" ]] || continue
    otool -L "$target" | tail -n +2 | awk '{print $1}' > "$dep_file"
    while IFS= read -r dep; do
      [[ "$dep" == /opt/homebrew/* ]] || continue
      base="${dep:t}"
      if [[ "$target" == "$bundled_node" ]]; then
        replacement="@loader_path/../lib/$base"
      else
        replacement="@loader_path/$base"
      fi
      install_name_tool -change "$dep" "$replacement" "$target"
    done < "$dep_file"
  done

  rm -f "$queue_file" "$dep_file"
}

copy_bundled_node_runtime

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleExecutable</key>
  <string>Cola Switch</string>
  <key>CFBundleIdentifier</key>
  <string>ai.simon.playground.cola-switch</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Cola Switch</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

clang \
  -fobjc-arc \
  -framework Cocoa \
  -framework WebKit \
  "$ROOT_DIR/app-src/main.m" \
  -o "$EXECUTABLE_PATH"

chmod +x "$EXECUTABLE_PATH"
if command -v codesign >/dev/null 2>&1; then
  for target in "$BIN_DIR/node" "$LIB_DIR"/*(.N) "$EXECUTABLE_PATH"; do
    [[ -e "$target" ]] || continue
    codesign --force --sign - "$target" >/dev/null 2>&1 || true
  done
  codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
fi
plutil -lint "$CONTENTS_DIR/Info.plist" >/dev/null

echo "Built app: $APP_DIR"
