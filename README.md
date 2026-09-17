# Rally

Rally is a browser game with a hosted game server and Roboflow cloud motion tracking over WebRTC. Players open an HTTPS link, create or join a room, and choose camera or keyboard. No installation, server address, or shared network is required.

Camera capture, local preview, rendering and sound run in the browser. Roboflow performs inference. Rally's server runs calibration, motion mapping, physics, form scoring, practice AI and multiplayer state. No browser inference model or locally simulated playable mode remains.

## Deploy

Use the [Azure deployment guide](docs/AZURE_DEPLOYMENT.md) for the Azure for Students deployment. The included [Render Blueprint](render.yaml) is an alternative. The owner needs cloud hosting and a Roboflow account with managed WebRTC access and billing/credits. Without a configured Roboflow credential, hosted keyboard play works and camera play reports that it is unavailable. See the [cloud deployment guide](docs/CLOUD_DEPLOYMENT.md) for architecture and acceptance checks.

One web service serves the frontend, API and Socket.IO under the same HTTPS origin. Roboflow supplies TURN relays for camera connections across networks. The default public `yolov8n-pose-640` model requires no custom workspace or training.

## Play

1. Select **Play together**, create a room and send its link to a teammate.
2. Choose **Start / restart camera** and allow camera permission, or use the keyboard.
3. For camera play, stand alone with shoulders and arms visible. Raise your playing hand, then lower it comfortably to calibrate.
4. Both players select **Ready to rally**. First to seven wins.

Keyboard: WASD or arrows move the racket; Space or Enter swings. Hosted practice includes a server-controlled partner. Two players on one keyboard use WASD/Space and arrows/Enter.

Video streams to Roboflow for inference. Rally receives joint coordinates; your opponent receives game state, not your camera or pose history. See [data handling](docs/CLOUD_DEPLOYMENT.md#data-and-security).

## Contributor checks

Node 24 and npm are needed by developers and CI only. Players never run these commands.

```sh
npm ci
npm test
npm run build
npm start
```

The build creates `apps/client/dist` and `apps/server/dist`. Static asset paths do not depend on the startup directory. For production, set `NODE_ENV=production` and `PUBLIC_ORIGIN` to the exact HTTPS origin, or use Render's automatically supplied URL.

After building, run `npx playwright install chromium` and `npm run test:e2e` for browser tests. `npm run dev` is an optional contributor workflow using a Vite proxy on port 5174 and server on 3001. Real Roboflow callbacks require a public HTTPS origin; automated provider tests use fixtures.

## Code map

- `apps/server/src/app.ts`: sessions, HTTP, Socket.IO, rate limits and lifecycle.
- `apps/server/src/roboflow.ts`: fixed workflow, managed WebRTC workers, authenticated callbacks and pose normalization.
- `apps/server/src/motion`: cloud calibration and form evaluation.
- `apps/server/src/rooms.ts`: room isolation, server controls and simulation, seat recovery.
- `packages/shared/src/engine.ts`: server physics/scoring; clients import constants and types only.
- `apps/client/src/engine.ts`: render-only state, without simulation methods.
- `apps/client/src/tracking.ts`: camera capture, WebRTC transport and cleanup.
- `apps/client/src/network.ts`: same-origin sessions and snapshot interpolation.

Rooms and sessions are in memory, so a restart ends active matches. Keep one server instance until distributed room routing is implemented. Defaults allow up to 100 rooms and four camera streams; these are admission limits, not measured capacity guarantees. Camera workers expire after 15 minutes and can be restarted.

Older hackathon specifications and reviews are historical. This README and the cloud deployment guide describe the current architecture.
