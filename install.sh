#!/usr/bin/env bash
set -euo pipefail
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine and Docker Compose v2 are required." >&2; exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(openssl rand -hex 32)
  sed -i "s|JWT_SECRET=replace-with-a-long-random-secret|JWT_SECRET=$secret|" .env
fi
read -r -p "Configure Firebase/Google sign-in now? [y/N] " setup_firebase
if [[ "$setup_firebase" =~ ^[Yy]$ ]]; then
  read -r -p "Firebase project ID: " project_id
  read -r -p "Firebase web API key: " api_key
  read -r -p "Firebase Auth domain: " auth_domain
  read -r -p "Realtime Database URL (optional): " database_url
  read -r -p "Firebase web App ID: " app_id
  read -r -s -p "Paste Firebase service-account JSON: " service_json; echo
  sed -i "s|^FIREBASE_PROJECT_ID=.*|FIREBASE_PROJECT_ID=$project_id|; s|^FIREBASE_API_KEY=.*|FIREBASE_API_KEY=$api_key|; s|^FIREBASE_AUTH_DOMAIN=.*|FIREBASE_AUTH_DOMAIN=$auth_domain|; s|^FIREBASE_DATABASE_URL=.*|FIREBASE_DATABASE_URL=$database_url|; s|^FIREBASE_APP_ID=.*|FIREBASE_APP_ID=$app_id|; s|^FIREBASE_SERVICE_ACCOUNT_JSON=.*|FIREBASE_SERVICE_ACCOUNT_JSON=$service_json|" .env
fi
docker compose up -d --build
echo "HomelabOS is running at http://localhost:$(grep '^HOMELABOS_PORT=' .env | cut -d= -f2)"
