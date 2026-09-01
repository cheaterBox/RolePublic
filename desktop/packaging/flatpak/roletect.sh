#!/bin/bash
# Wrapper script for RoleTect Flatpak
# Sets working directory so Tauri resolves ../dist correctly
# Disables DMA-BUF and compositing to fix white WebKitGTK screen in Flatpak
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
cd /app/share/roletect
exec /app/bin/roletect "$@"
