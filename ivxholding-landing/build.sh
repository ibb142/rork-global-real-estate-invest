#!/bin/bash
echo "[IVX Build] Injecting environment variables into index.html..."

if [ -f "index.html" ]; then
  cp index.html index.html.bak

  SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
  SUPABASE_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
  API_URL="${EXPO_PUBLIC_API_BASE_URL:-https://ivxholding.com}"
  APP_URL="${EXPO_PUBLIC_APP_URL:-${EXPO_PUBLIC_RORK_API_BASE_URL:-}}"

  if [ -n "$SUPABASE_URL" ]; then
    sed -i "s|__IVX_SUPABASE_URL__|${SUPABASE_URL}|g" index.html
    echo "[IVX Build] ✓ Supabase URL injected"
  else
    echo "[IVX Build] ⚠ EXPO_PUBLIC_SUPABASE_URL not set"
  fi

  if [ -n "$SUPABASE_KEY" ]; then
    sed -i "s|__IVX_SUPABASE_ANON_KEY__|${SUPABASE_KEY}|g" index.html
    echo "[IVX Build] ✓ Supabase Anon Key injected"
  else
    echo "[IVX Build] ⚠ EXPO_PUBLIC_SUPABASE_ANON_KEY not set"
  fi

  sed -i "s|__IVX_API_BASE_URL__|${API_URL}|g" index.html
  echo "[IVX Build] ✓ API URL injected: ${API_URL}"

  if [ -n "$APP_URL" ]; then
    sed -i "s|__IVX_APP_URL__|${APP_URL}|g" index.html
    echo "[IVX Build] ✓ App URL injected: ${APP_URL}"
  else
    echo "[IVX Build] ⚠ App URL not set"
  fi

  echo "[IVX Build] Done."
else
  echo "[IVX Build] ERROR: index.html not found!"
  exit 1
fi
