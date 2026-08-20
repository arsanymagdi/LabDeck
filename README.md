# HomelabOS

HomelabOS is a single-repository, self-hosted control plane for a Docker-based homelab. It includes the React dashboard, FastAPI control API, live telemetry, Docker discovery/control, an installable mobile web app, and an optional browser terminal service.

## Install with Docker

```bash
git clone <your-repository-url> homelabos
cd homelabos
chmod +x install.sh
./install.sh
```

The installer creates a local `.env`, generates a JWT secret, optionally collects Firebase values, and starts the stack. Open `http://SERVER_IP:8080` afterwards. Change `DASHBOARD_PASSWORD` in `.env` before exposing the dashboard.

## File storage

The Storage page is a browser for `/home/arsani/`, including `/home/arsani/homelab/data/storage/`. It can upload, download, create folders, and delete files from your browser. Create the storage subdirectory before starting the stack if needed:

```bash
mkdir -p /home/arsani/homelab/data/storage
```

To run the optional ttyd sidecar:

```bash
docker compose --profile terminal up -d
```

## Included services

| Service | Purpose |
| --- | --- |
| `web` | Nginx-served responsive dashboard and reverse proxy |
| `api` | FastAPI, system telemetry, Docker discovery/control, and authentication |
| `ttyd` (optional) | Browser terminal sidecar |

The API receives the host Docker socket so it automatically inventories existing containers. Docker socket access is equivalent to high host privileges; use only on a trusted server and place HomelabOS behind HTTPS/authentication before public exposure.

## Google Sign-In and Firebase

Firebase is optional. The local admin account works when it is disabled.

1. Create or select a Firebase project.
2. Enable **Google** in Firebase Authentication providers and add your HomelabOS domain to Authorized domains.
3. Create a Web App and collect its project ID, API key, auth domain, app ID, and (if needed) Realtime Database URL.
4. Create a service account key in Firebase project settings and keep it private.
5. Run `./install.sh`, answer `y` to Firebase setup, and provide these values.

The browser receives only Firebase's public web configuration. The service-account JSON remains in `.env` on the server; the API verifies Firebase identity tokens and returns its own short-lived API token. When a Realtime Database URL is provided, the API also mirrors a safe, current telemetry subset to `homelabos/servers/<hostname>/status` for Firebase-connected clients.

## Mobile and desktop access

The dashboard is a PWA: visit it on iOS, Android, ChromeOS, Windows, Linux, or macOS and use the browser's **Install app** / **Add to Home Screen** action. It runs as a standalone, responsive access app while sharing the same authenticated API as desktop browsers.

### Native iOS / Capacitor

The repository also includes a Capacitor iOS shell. Build and sync it locally with:

```bash
npm ci
npm --prefix frontend ci
npm run cap:sync:ios
```

Open `ios/App/App.xcodeproj` in Xcode to run it on a simulator or a signed device. The app asks for the Homelab server URL at login; use an HTTPS URL whenever possible. HTTP LAN addresses work in this native build to support private homelabs.

For Codemagic, commit `codemagic.yaml`, add the repository as an **Ionic Capacitor** app (or use the custom `codemagic.yaml` option), and run the `ios-unsigned-ipa` workflow. It builds the frontend, syncs Capacitor, archives with code signing explicitly disabled, and uploads `LabDeck-unsigned.ipa` as an artifact. The workflow uses a clean macOS frontend install so Vite can load its Apple Silicon native dependency. An unsigned IPA cannot be installed on a physical iPhone directly: it must be signed later (for example for development, ad-hoc distribution, TestFlight, or an approved sideloading workflow).

## Development

```bash
./start.sh
```

The Vite development server proxies `/api` and WebSockets to FastAPI, so it behaves like the Docker deployment.
