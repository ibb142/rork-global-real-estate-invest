#!/usr/bin/env bash
# IVX real-device startup log capture helper.
# Run this on a computer with adb installed and a USB-debugging-enabled Android device.
#
# Usage:
#   chmod +x expo/scripts/capture-real-device-logs.sh
#   ./expo/scripts/capture-real-device-logs.sh

set -euo pipefail

PACKAGE="com.ivxholdings.app"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="${IVX_LOG_DIR:-$HOME/Desktop}"
OUT_FILE="$OUT_DIR/ivx-startup-$TIMESTAMP.log"

echo "IVX real-device log capture"
echo "Package: $PACKAGE"
echo "Output:  $OUT_FILE"
echo ""

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb not found. Install Android SDK platform-tools and add adb to PATH."
  exit 1
fi

echo "Checking device..."
adb devices -l | grep -v "List of devices" | grep -v "^$" || true
echo ""

echo "Clearing logcat buffer..."
adb logcat -c

echo "Starting logcat capture. Launch IVX now (or force-stop and reopen it)."
echo "Capturing for 45 seconds..."
adb logcat -v threadtime > "$OUT_FILE" &
CAPTURE_PID=$!

sleep 45
kill $CAPTURE_PID 2>/dev/null || true

echo ""
echo "Capture saved to: $OUT_FILE"
echo ""
echo "=== Startup trace summary (IVX-STARTUP) ==="
grep -E "IVX-STARTUP|ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|IVX is taking longer|IVX startup timed out" "$OUT_FILE" | tail -80 || true

echo ""
echo "=== Package lifecycle events ==="
grep -E "ActivityManager.*$PACKAGE|WindowManager.*$PACKAGE" "$OUT_FILE" | tail -40 || true

echo ""
echo "Send $OUT_FILE to the Rork agent for analysis."
