# Azure App Service deployment

Rally can run on one Linux Azure App Service instance using Node 24 LTS.
Players open its HTTPS address; no Azure account or local server is required.
Roboflow still supplies the managed WebRTC inference workers and TURN relays.

## Infrastructure

- Resource group: `rally-cloud`
- App Service plan: `rally-plan`, Linux Basic B1, one instance
- App: `rally-sharon`
- Region: Canada Central
- Public origin: `https://rally-sharon.azurewebsites.net`
- Startup command: `node apps/server/dist/index.js`
- Always On and WebSockets enabled; HTTPS required, minimum TLS 1.2

Use the existing Azure for Students subscription. Credits pay for usage; this
is not an indefinitely free hosting plan. Check the subscription's balance and
actual regional pricing in Azure Cost Management. Keep its spending protection
enabled. A budget alert is not a hard spending cap. Stopping a web app alone
does not stop App Service plan charges.

Student subscriptions restrict deployment regions. Check the assigned policy
before provisioning. If a freshly created subscription shows an Owner role in
the portal but Cloud Shell returns AuthorizationFailed, refresh the CLI login
and confirm the selected subscription before retrying. Do not change roles or
disable policies to work around an access error.

## Settings

Set these in App Service environment variables:

```text
NODE_ENV=production
PUBLIC_ORIGIN=https://rally-sharon.azurewebsites.net
MAX_CAMERA_STREAMS=4
ROBOFLOW_MODEL_ID=yolov8n-pose-640
ROBOFLOW_REGION=us
SCM_DO_BUILD_DURING_DEPLOYMENT=false
WEBSITE_NODE_DEFAULT_VERSION=~24
```

Add `ROBOFLOW_API_KEY` as a private server setting. Never put the value in a
commit, browser bundle, chat message, deployment archive or shell history.
Azure and Roboflow credits are separate. The Roboflow account must retain
access to managed WebRTC inference after any trial expires.

## Deploy or roll back

From an authenticated Azure Cloud Shell, check out the reviewed commit, then
build and package the production files:

```bash
npm ci --include=dev
npm run build
npm prune --omit=dev
zip -q -r ../rally-release.zip .deployment package.json apps/client/dist \
  apps/server/dist node_modules -x 'node_modules/@rally/*'
az webapp deploy --resource-group rally-cloud --name rally-sharon \
  --src-path ../rally-release.zip --type zip --async true \
  --enable-kudu-warmup false
```

This builds in the cloud and uploads compiled assets with production
dependencies. Automatic Oryx builds omitted compiler dependencies in this
App Service environment, so remote build automation is disabled for this
prebuilt archive. The archive's `.deployment` file explicitly disables
additional build steps. The bundled server inlines Rally's shared workspace
code, so the excluded workspace symlinks are not runtime dependencies. Use a fresh
archive filename or remove only the previous release archive before packaging
to avoid retaining stale files in a ZIP. Run `npm ci --include=dev` again before
contributor tests after pruning.
Inspect deployment logs and `/health`; an accepted upload alone does not mean
the application is ready. Deploying a prior reviewed commit uses the same
process. Deployments and instance restarts end active matches because room
state is in memory. Keep the instance count at one.

Complete the real camera and cross-network acceptance checks in
[CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) before declaring camera play verified.

An opt-in live smoke test uses synthetic video, forces a TURN relay, requires
fresh Roboflow callbacks, and stops the worker afterwards. It consumes Roboflow
credits. After installing Playwright Chromium, run:

```bash
RALLY_LIVE_URL=https://rally-sharon.azurewebsites.net RALLY_TEST_CAMERA=1 \
  npx playwright test --config playwright.live.config.ts
```

This checks transport and inference delivery; a person still needs to verify
physical calibration and motion gameplay with a real camera.

The CI workflow also runs these live checks when a pushed commit message
contains `[live-check]`. Normal commits and pull-request runs skip them.
Use that marker only when the Azure deployment is ready and consumption of
Roboflow credits is intended. No private Roboflow key is sent to CI; tests use
the same public game endpoints as players.
