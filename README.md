# youtube-upload

A minimalistic testing project using YouTube Studio internal API to upload videos. Not in a working state.

Based on https://github.com/adasq/youtube-studio

## Encountered issues

### 1. `sessionInfo.token`

A session token (`sessionToken`) is **required** for the final step of uploading a video - calling `https://studio.youtube.com/youtubei/v1/upload/createvideo`. Getting it via API is deemed impossible due to anti-bot measures. The token reportedly lasts for 7 days.

#### Method 0 (manual)

See https://github.com/adasq/youtube-studio#preparing-authentication

#### Method 1 (`get` and `esr`)

1. `POST https://studio.youtube.com/youtubei/v1/att/get` (no special data required), returns `botguardData` and `challenge`.
2. Solve `botguardData.program` using Google interpreter.
3. `POST https://studio.youtube.com/youtubei/v1/att/esr` with `challenge` (step 1) and `botguardResponse` (step 2), returns `sessionToken`.

##### Takeaways

- Reverse engineering botguard is absolutely not worth it.
- Using an old `botguardResponse` with a new `challenge` does not work.
- **TO CHECK:** what exactly happens if you pass the same `challenge` and `botguardResponse` after a week? Returns an already expired session token, nothing, or a new token?

#### Method 2 (`get_web_reauth_url` and `grst`)

1. `POST https://studio.youtube.com/youtubei/v1/security/get_web_reauth_url` with `challenge` and `botguardResponse` from method 1, and `ivctx` from `/esr` (method 1); returns `sessionRiskCtx`.
2. `POST https://studio.youtube.com/youtubei/v1/ars/grst` with `sessionRiskCtx` (step 1), returns `sessionToken`.

##### Takeaways

- Reverse engineering botguard is still completely not worth it.
- **TO CHECK:** what happens if you pass the same `challenge`, `botguardResponse`, and `ivctx` to `/get_web_reauth_url` (step 1) after a week?
- **TO CHECK:** what happens if you pass the same `sessionRiskCtx` to `/grst` (step 2) after a week?

#### The solution

Use something like [Selenium](https://www.npmjs.com/package/selenium-webdriver) or [Puppeteer](https://www.npmjs.com/package/puppeteer). See https://github.com/mdashlw/youtube-upload/blob/8fdd45713be235ebb5d4925426bc377f27b72408/puppeteer.js for a working implementation.
