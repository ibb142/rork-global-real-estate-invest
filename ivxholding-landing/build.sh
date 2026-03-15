#!/bin/bash
echo "[IVX Build] Injecting environment variables into index.html..."

if [ -f "index.html" ]; then
  cp index.html index.html.bak

  SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
  SUPABASE_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
  API_URL="${EXPO_PUBLIC_API_BASE_URL:-https://ivxholding.com}"
  APP_URL="${EXPO_PUBLIC_APP_URL:-${EXPO_PUBLIC_RORK_API_BASE_URL:-}}"
  BACKEND_URL="${EXPO_PUBLIC_RORK_API_BASE_URL:-https://dev-jh1qrutuhy6vu1bkysoln.rorktest.dev}"

  if [ -n "$SUPABASE_URL" ]; then
    sed -i "s|__IVX_SUPABASE_URL__|${SUPABASE_URL}|g" index.html
    echo "[IVX Build] ✓ Supabase URL injected"
  else
    echo "[IVX Build] ⚠ EXPO_PUBLIC_SUPABASE_URL not set — credential discovery will be used at runtime"
  fi

  if [ -n "$SUPABASE_KEY" ]; then
    sed -i "s|__IVX_SUPABASE_ANON_KEY__|${SUPABASE_KEY}|g" index.html
    echo "[IVX Build] ✓ Supabase Anon Key injected"
  else
    echo "[IVX Build] ⚠ EXPO_PUBLIC_SUPABASE_ANON_KEY not set — credential discovery will be used at runtime"
  fi

  sed -i "s|__IVX_API_BASE_URL__|${API_URL}|g" index.html
  echo "[IVX Build] ✓ API URL injected: ${API_URL}"

  sed -i "s|__IVX_BACKEND_URL__|${BACKEND_URL}|g" index.html
  echo "[IVX Build] ✓ Backend URL injected: ${BACKEND_URL}"

  if [ -n "$APP_URL" ]; then
    sed -i "s|__IVX_APP_URL__|${APP_URL}|g" index.html
    echo "[IVX Build] ✓ App URL injected: ${APP_URL}"
  else
    sed -i "s|__IVX_APP_URL__||g" index.html
    echo "[IVX Build] ⚠ App URL not set — invest buttons will open waitlist funnel"
  fi

  # Also inject fallback JS vars with backend URL for credential discovery
  sed -i "s|var _HARDCODED_BACKEND_URL = '[^']*';|var _HARDCODED_BACKEND_URL = '${BACKEND_URL}';|g" index.html
  echo "[IVX Build] ✓ Hardcoded backend URL injected into JS"

  # Generate ivx-config.json for runtime credential discovery
  if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ]; then
    cat > ivx-config.json <<EOF
{
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_KEY}",
  "apiBaseUrl": "${API_URL}",
  "appUrl": "${APP_URL}",
  "backendUrl": "${BACKEND_URL}",
  "configEndpoint": "${BACKEND_URL}/api/landing-config",
  "dealsEndpoint": "${BACKEND_URL}/api/landing-deals",
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    echo "[IVX Build] ✓ ivx-config.json generated with full credentials"
  else
    cat > ivx-config.json <<EOF
{
  "supabaseUrl": "",
  "supabaseAnonKey": "",
  "apiBaseUrl": "${API_URL}",
  "appUrl": "${APP_URL}",
  "backendUrl": "${BACKEND_URL}",
  "configEndpoint": "${BACKEND_URL}/api/landing-config",
  "dealsEndpoint": "${BACKEND_URL}/api/landing-deals",
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "note": "Supabase credentials will be discovered at runtime from backend /api/landing-config"
}
EOF
    echo "[IVX Build] ✓ ivx-config.json generated with backend URL for credential discovery"
    echo "[IVX Build] ⚠ Landing page will discover Supabase credentials from: ${BACKEND_URL}/api/landing-config"
  fi

  echo "[IVX Build] Done. Files ready for deploy."
else
  echo "[IVX Build] ERROR: index.html not found!"
  exit 1
fi
