#!/bin/bash
echo "[IVX Build] Injecting environment variables into index.html..."

if [ -f "index.html" ]; then
  cp index.html index.html.bak

  SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
  SUPABASE_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
  API_URL="${EXPO_PUBLIC_API_BASE_URL:-https://ivxholding.com}"
  APP_URL="${EXPO_PUBLIC_APP_URL:-${EXPO_PUBLIC_RORK_API_BASE_URL:-}}"
  BACKEND_URL="${EXPO_PUBLIC_RORK_API_BASE_URL:-https://dev-jh1qrutuhy6vu1bkysoln.rorktest.dev}"

  echo "[IVX Build] Backend URL: ${BACKEND_URL}"
  echo "[IVX Build] Supabase URL set: $([ -n "$SUPABASE_URL" ] && echo 'YES' || echo 'NO')"
  echo "[IVX Build] Supabase Key set: $([ -n "$SUPABASE_KEY" ] && echo 'YES' || echo 'NO')"

  if [ -n "$SUPABASE_URL" ]; then
    sed -i "s|__IVX_SUPABASE_URL__|${SUPABASE_URL}|g" index.html
    echo "[IVX Build] Supabase URL injected"
  else
    echo "[IVX Build] EXPO_PUBLIC_SUPABASE_URL not set — will discover from backend at runtime"
  fi

  if [ -n "$SUPABASE_KEY" ]; then
    sed -i "s|__IVX_SUPABASE_ANON_KEY__|${SUPABASE_KEY}|g" index.html
    echo "[IVX Build] Supabase Anon Key injected"
  else
    echo "[IVX Build] EXPO_PUBLIC_SUPABASE_ANON_KEY not set — will discover from backend at runtime"
  fi

  sed -i "s|__IVX_API_BASE_URL__|${API_URL}|g" index.html
  sed -i "s|__IVX_BACKEND_URL__|${BACKEND_URL}|g" index.html
  echo "[IVX Build] API + Backend URLs injected"

  if [ -n "$APP_URL" ]; then
    sed -i "s|__IVX_APP_URL__|${APP_URL}|g" index.html
  else
    sed -i "s|__IVX_APP_URL__||g" index.html
  fi

  # Inject Google Ads key
  GADS_KEY="${EXPO_PUBLIC_GOOGLE_ADS_API_KEY:-}"
  if [ -n "$GADS_KEY" ]; then
    sed -i "s|__IVX_GOOGLE_ADS_KEY__|${GADS_KEY}|g" index.html
    echo "[IVX Build] Google Ads key injected"
  else
    echo "[IVX Build] EXPO_PUBLIC_GOOGLE_ADS_API_KEY not set — Google Ads tracking disabled"
  fi

  sed -i "s|var _HARDCODED_BACKEND_URL = '[^']*';|var _HARDCODED_BACKEND_URL = '${BACKEND_URL}';|g" index.html

  # Also inject backend URL into fallback JS vars and meta tags
  sed -i "s|var _RORK_BACKEND_URL = '[^']*';|var _RORK_BACKEND_URL = '${BACKEND_URL}';|g" index.html
  sed -i "s|var _RORK_API_URL = '[^']*';|var _RORK_API_URL = '${API_URL}';|g" index.html

  # Inject backend URL into meta tags for JS to read
  sed -i "s|<meta name=\"ivx-backend-url\" content=\"[^\"]*\"|<meta name=\"ivx-backend-url\" content=\"${BACKEND_URL}\"|g" index.html
  sed -i "s|<meta name=\"ivx-api-url\" content=\"[^\"]*\"|<meta name=\"ivx-api-url\" content=\"${API_URL}\"|g" index.html

  echo "[IVX Build] All JS vars + meta tags injected"

  # ALWAYS generate ivx-config.json — with or without Supabase creds
  # The backend URL is always set, so credential discovery always works
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
  echo "[IVX Build] ivx-config.json generated"

  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "[IVX Build] NOTE: Supabase credentials not in env — landing page will auto-discover from: ${BACKEND_URL}/api/landing-config"
  fi

  echo "[IVX Build] Done. Files ready for deploy."
else
  echo "[IVX Build] ERROR: index.html not found!"
  exit 1
fi
