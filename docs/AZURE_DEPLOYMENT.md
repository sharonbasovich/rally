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
SCM_DO_BUILD_DURING_DEPLOYMENT=true
WEBSITE_NODE_DEFAULT_VERSION=~24
NPM_CONFIG_INCLUDE=dev
```

Add `ROBOFLOW_API_KEY` as a private server setting. Never put the value in a
commit, browser bundle, chat message, deployment archive or shell history.
Azure and Roboflow credits are separate. The Roboflow account must retain
access to managed WebRTC inference after any trial expires.

## Deploy or roll back

From an authenticated Azure Cloud Shell, check out the reviewed commit, then:

```bash
git archive --format=zip HEAD -o ../rally-release.zip
az webapp deploy --resource-group rally-cloud --name rally-sharon \
  --src-path ../rally-release.zip --type zip --async true
```

Remote build automation installs dependencies and runs the production build.
`NPM_CONFIG_INCLUDE=dev` keeps TypeScript and Vite available during the build
even though the app runs with `NODE_ENV=production`.
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
