# Browser tracking alternative

`browser-tracking` branches from `cloud-play` at `0dbed154341563cf70992589a079b41da0c3ad5b`.
`cloud-play` retains Roboflow/WebRTC camera streaming. The existing Azure site
continues to run that version. This branch has its own deployment:

- Browser tracking: https://rally-sharon-browser.azurewebsites.net
- Roboflow/WebRTC: https://rally-sharon.azurewebsites.net

Both use the existing `rally-plan` App Service plan in Canada Central.
Rooms are separate: both players must open the same version.

Players only open an HTTPS website and grant camera permission. No installs,
Tailscale, developer tools, or local server setup are required.

## Camera pipeline

Camera → MediaPipe Pose Landmarker Lite in a browser worker → landmarks over
the existing authenticated Socket.IO connection → authoritative game server.
Video never leaves the browser. The model and pinned WASM runtime are served
by the website, downloaded only when camera tracking starts. No Roboflow key,
WebRTC connection, TURN relay, or inference subscription is used by this client.

The worker processes at most one frame at a time, capped at 30 FPS, using CPU
inference to avoid contention with the 3D court's GPU rendering. Old inference results are discarded. Local
calibration feedback does not wait for the server. The server independently
calibrates landmarks and computes paddle movement, physics, and form scores.
Rendered gameplay still has the server round trip; this is not zero-latency
local gameplay or client prediction.

Brief tracking loss holds the last paddle position and clears swing velocity.
After 1.5 seconds without a valid pose, play pauses. The UI says "Rally paused"
instead of implying that every camera failure is a network disconnect.

## Trust and limitations

Clients now supply landmarks. The server bounds payloads, checks sequences,
rate-limits submissions, and uses server timestamps, but cannot prove that
landmarks came from a real camera. This mode is suitable for casual games,
not cheat-resistant competitive scoring. Camera performance depends on the
device and browser; real-person accuracy and end-to-end latency need testing.

The server retains the old cloud endpoint implementation for comparison tests,
but this client never calls it. Leave `ROBOFLOW_API_KEY` unset when deploying
this branch. Existing cloud deployment/acceptance documents describe
`cloud-play`; their Roboflow camera checks do not apply here.

## Contributor verification and deployment

Use Node 24. `npm ci` copies the pinned MediaPipe WASM assets automatically;
the pose model is versioned in the repository. Run `npm test`, `npm run build`,
and `npm run test:e2e` after installing Playwright Chromium. The browser suite
processes synthetic camera frames in the actual worker, checks that no cloud
inference requests occur, tests model-load failure and keyboard fallback,
and exercises multiplayer reconnects. Synthetic frames do not validate human
calibration or motion accuracy.

Deployment uses the same compiled Azure packaging process, targeting
`rally-sharon-browser` in resource group `rally-cloud`. Set `PUBLIC_ORIGIN`
to its HTTPS URL, use Node 24, enable WebSockets and Always On, and keep
`ROBOFLOW_API_KEY` unset. Both apps share one B1 plan's CPU and memory;
no additional App Service plan was created.

Initial deployed release: `5e54f6678916e12933eabf97b5def0bbb776f092`.
Live acceptance tests run with `RALLY_LIVE_URL` set to the browser app and
`npx playwright test --config playwright.browser-live.config.ts`.
A push marked `[browser-live-check]` runs these tests in CI after waiting
for `/health` to report the matching commit. Deployment itself remains
an explicit Azure action; pushing a branch does not replace either app.
