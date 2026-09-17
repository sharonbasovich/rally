# Cloud deployment

These are project-owner steps. Players only open the HTTPS URL and choose camera or keyboard.

## Provision

1. Publish the `cloud-play` branch to the fork. Merge it, or select it when creating a Render Blueprint.
2. Create a Blueprint using `render.yaml`. This selects one paid Starter web service in Virginia. Review the current price before confirming the subscription. Keep one instance and disable automatic deploys during matches.
3. Put a private `ROBOFLOW_API_KEY` in Render's secret settings. The account must have managed WebRTC inference access and credits. Do not put the key in chat, source code, or a `VITE_` variable.
4. Render builds and starts the app. Its `RENDER_EXTERNAL_URL` supplies the public callback origin automatically. For a custom domain, set `PUBLIC_ORIGIN` to the exact HTTPS origin, without a trailing slash.
5. Check `/health`, then complete the acceptance checks below before public launch.

The default public model is `yolov8n-pose-640`; no custom workspace or training is needed. Alternate models must emit the same zero-based COCO 17-joint layout. The default region is `us`, capacity is four simultaneous camera streams, and each worker expires after 900 seconds. Users can restart and recalibrate after expiry.

## Architecture

Browser camera video travels over WebRTC to a managed Roboflow worker, using Roboflow TURN relays when necessary. The browser gets only temporary ICE credentials and the SDP answer. The server fixes the model, workflow, webhook URL and private webhook credential.

Roboflow's versioned keypoint block feeds an authenticated webhook containing serialized joint coordinates, frame number and frame timestamp. The sink uses zero cooldown, a two-second request timeout and synchronous delivery to prevent an unbounded callback queue. Realtime processing drops old frames. Rally rejects duplicate, out-of-order, future and more-than-500ms-old frames and pauses on missing fresh motion. Use nearby cloud regions and measure actual latency.

The Rally server owns calibration, motion mapping, keyboard integration, form scoring, physics, practice AI and room state. Clients render interpolated snapshots. There is no client form-score endpoint. Sessions are opaque server-issued tokens stored per browser tab, bound to socket and room seat.

## Data and security

Camera video is encrypted in transit to Roboflow. Rally does not request audio, record frames or persist pose histories. Active learning is disabled. Roboflow's service terms and retention policy still apply; the application does not promise the absence of vendor-side diagnostics. Opponents receive game state, not video or pose histories. Players see a disclosure before choosing Start camera.

Session issuance, room attempts, socket events and camera starts have rate limits. Capacity and worker TTL bound resource use. Anonymous rooms are invitations, not accounts: anyone with a code can claim an empty seat. For a large public launch, add edge bot protection, account quotas and billing alerts; distributed traffic can still consume anonymous capacity.

Workers are revoked on leave, disconnect, camera failure, keyboard fallback, stale timeout and shutdown. A worker that finishes starting after cancellation is terminated when its response arrives. If an initialization response is lost entirely, the server cannot know the pipeline ID; Roboflow's 15-minute timeout is the final bound.

One Render instance is intentional. Rooms and sessions live in memory; deploys/restarts end active matches. Do not enable horizontal scaling until room ownership and routing are externalized. Admission limits are not measured capacity guarantees.

## Live acceptance checks

- Open the HTTPS URL on two devices on different networks, such as Wi-Fi and mobile data. Create, join, ready, play, pause, recover and replay.
- Calibrate both cameras. Check that left/right arms map correctly and moving a hand moves the server-owned racket. Verify a relay candidate is selected on a restrictive network; STUN-only success does not prove reliable cross-network play.
- Inspect Roboflow worker logs for successful model loading and authenticated webhook delivery. Measure inference FPS, callback age, game RTT and camera-to-racket responsiveness during fast swings. Frame timestamps originate at the Roboflow receiver; callback age is not end-to-end latency.
- Hide the tab, unplug/deny the camera, lose connectivity and return. Play must pause rather than use stale motion; keyboard fallback must remain available.
- Verify independent rooms, replay reset, full-room rejection and same-seat recovery within 60 seconds of disconnect.
- Inspect browser requests: no private API key, callback secret, local model binary, MediaPipe worker, configurable server address or form-score submission. Temporary TURN credentials and the session token are intentionally browser-visible.
- Leave both rooms and confirm billed workers terminate. Check stream capacity and maximum lifetime, and configure billing alerts in both providers.
- During deployment, expect active matches to end. Roll back via Render to the previous working commit if health, room or camera tests fail.

Fixture tests do not replace these live tests. A deployment without a valid Roboflow key supports cloud keyboard play and reports camera unavailability.

## Provider references

Implementation contracts were checked against the official [Roboflow SDK](https://github.com/roboflow/inference-sdk-js/blob/master/src/inference-api.ts), [WebRTC guide](https://docs.roboflow.com/reference/inference/inference-sdk/webrtc), [webhook block](https://github.com/roboflow/inference/blob/main/inference/core/workflows/core_steps/sinks/webhook/v1.py), [model aliases](https://inference.roboflow.com/quickstart/aliases/), and [Render Blueprint specification](https://render.com/docs/blueprint-spec).
