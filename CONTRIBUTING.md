# Contributing

Use Node 24. Run `npm ci`, `npm test`, `npm run build`, and `npm run test:e2e` before opening a PR. See README.md for setup and docs/CLOUD_DEPLOYMENT.md for deployment requirements.

Keep gameplay authority and motion inference outside the browser. Do not add browser form-score submissions, locally simulated practice, client API keys, arbitrary workflow proxies, or player-configured server addresses. Distinguish provider fixtures from live Roboflow tests.

Historical hackathon specifications describe the starting point, not the current deployment architecture.
