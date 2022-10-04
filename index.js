import crypto from "node:crypto";
import timers from "node:timers/promises";
import puppeteer from "puppeteer";
import undici from "undici";

const YOUTUBE_STUDIO_URL = "https://studio.youtube.com";

let storage;
let ytcfg, sessionToken;

function refresh() {
  return new Promise(async (resolve) => {
    const browser = await puppeteer.launch({
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();

    await page.setUserAgent(
      (await browser.userAgent()).replace("HeadlessChrome", "Chrome")
    );
    await page.setCookie(
      {
        name: "HSID",
        value: storage.HSID,
        domain: ".youtube.com",
      },
      {
        name: "SSID",
        value: storage.SSID,
        domain: ".youtube.com",
      },
      {
        name: "APISID",
        value: storage.APISID,
        domain: ".youtube.com",
      },
      {
        name: "SAPISID",
        value: storage.SAPISID,
        domain: ".youtube.com",
      },
      {
        name: "SID",
        value: storage.SID,
        domain: ".youtube.com",
      }
    );
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      if (request.isInterceptResolutionHandled()) {
        return;
      }

      const url = new URL(request.url());

      if (
        (url.hostname === "studio.youtube.com" &&
          (url.pathname === "/" ||
            url.pathname === "/ytscframe" ||
            url.pathname === "/youtubei/v1/att/get" ||
            url.pathname === "/youtubei/v1/att/esr" ||
            url.pathname.endsWith("/creator_studio_mod_binary_core_v2.js"))) ||
        url.hostname === "www.google.com"
      ) {
        request.continue();
      } else {
        request.abort();
      }
    });

    page.on("requestfinished", async (request) => {
      const url = new URL(request.url());

      if (
        url.hostname === "studio.youtube.com" &&
        url.pathname === "/youtubei/v1/att/esr"
      ) {
        const data = await request.response().json();

        ytcfg = await page.evaluate(() => ytcfg.data_);
        sessionToken = data.sessionToken;
        await browser.close();
        resolve();
      }
    });

    await page.goto(YOUTUBE_STUDIO_URL);
  });
}

export async function init(cookies) {
  storage = cookies;
  await refresh();
  setInterval(async () => await refresh(), 1 * 60 * 60 * 1_000).unref();
}

function generateFrontendUploadId() {
  function generateSessionId() {
    var MEc =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(
        ""
      );

    for (var a = Array(36), b = 0, c, e = 0; 36 > e; e++)
      8 == e || 13 == e || 18 == e || 23 == e
        ? (a[e] = "-")
        : 14 == e
        ? (a[e] = "4")
        : (2 >= b && (b = (33554432 + 16777216 * Math.random()) | 0),
          (c = b & 15),
          (b >>= 4),
          (a[e] = MEc[19 == e ? (c & 3) | 8 : c]));
    return a.join("");
  }

  const sessionId = generateSessionId();
  const nextIndex = 0;

  return `innertube_studio:${sessionId}:${nextIndex}`;
}

async function startUpload(frontendUploadId, { fileName }) {
  const response = await undici.request(ytcfg.UPLOAD_CONFIG.scottyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      cookie: `HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}; SID=${storage.SID}`,
      "x-goog-upload-command": "start",
      "x-goog-upload-file-name": fileName,
      "x-goog-upload-protocol": "resumable",
    },
    body: JSON.stringify({ frontendUploadId }),
    throwOnError: true,
  });

  return response.headers["x-goog-upload-url"];
}

async function uploadAndFinalize(uploadUrl, { fileName, stream }) {
  const response = await undici.request(uploadUrl, {
    method: "POST",
    headers: {
      cookie: `HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}; SID=${storage.SID}`,
      "x-goog-upload-command": "upload, finalize",
      "x-goog-upload-file-name": fileName,
      "x-goog-upload-offset": "0",
    },
    body: stream,
    throwOnError: true,
  });
  const data = await response.body.json();

  if (data.status !== "STATUS_SUCCESS") {
    throw new Error(`Unsuccessful response: ${JSON.stringify(data)}`);
  }

  return data.scottyResourceId;
}

function generateSAPISIDHASH() {
  const timestamp = Date.now();
  const hash = crypto
    .createHash("sha1")
    .update(`${timestamp} ${storage.SAPISID} ${YOUTUBE_STUDIO_URL}`)
    .digest("hex");

  return `${timestamp}_${hash}`;
}

async function createVideo({
  scottyResourceId,
  frontendUploadId,
  initialMetadata,
}) {
  const response = await undici.request(
    `https://studio.youtube.com/youtubei/v1/upload/createvideo?alt=json&key=${ytcfg.INNERTUBE_API_KEY}`,
    {
      method: "POST",
      headers: {
        authorization: `SAPISIDHASH ${generateSAPISIDHASH()}`,
        cookie: `HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}; SID=${storage.SID}`,
        origin: YOUTUBE_STUDIO_URL,
        referer: YOUTUBE_STUDIO_URL,
        "user-agent": ytcfg.INNERTUBE_CONTEXT.client.userAgent.substring(
          0,
          ytcfg.INNERTUBE_CONTEXT.client.userAgent.lastIndexOf(",")
        ),
        "x-origin": YOUTUBE_STUDIO_URL,
      },
      body: JSON.stringify({
        channelId: ytcfg.CHANNEL_ID,
        resourceId: {
          scottyResourceId: {
            id: scottyResourceId,
          },
        },
        frontendUploadId,
        initialMetadata,
        context: {
          client: {
            clientName: 62,
            clientVersion: "1.20221002.01.00",
            hl: "en",
            gl: "US",
            experimentsToken: "",
            utcOffsetMinutes: 180,
            userInterfaceTheme: "USER_INTERFACE_THEME_DARK",
            screenWidthPoints: 1920,
            screenHeightPoints: 961,
            screenPixelDensity: 1,
            screenDensityFloat: 1,
          },
          request: {
            returnLogEntry: true,
            internalExperimentFlags: [],
            sessionInfo: {
              token: sessionToken,
            },
          },
          user: {
            onBehalfOfUser: ytcfg.DELEGATED_SESSION_ID,
            delegationContext: ytcfg.DELEGATION_CONTEXT,
            serializedDelegationContext:
              ytcfg.INNERTUBE_CONTEXT_SERIALIZED_DELEGATION_CONTEXT,
          },
          clientScreenNonce: ytcfg["client-screen-nonce"],
        },
        delegationContext: ytcfg.DELEGATION_CONTEXT,
      }),
      throwOnError: true,
    }
  );
  const data = await response.body.json();

  return data;
}

export async function upload({ fileName, stream }, metadata) {
  const frontendUploadId = generateFrontendUploadId();
  const uploadUrl = await startUpload(frontendUploadId, {
    fileName,
  });
  const scottyResourceId = await uploadAndFinalize(uploadUrl, {
    fileName,
    body: stream,
  });
  const data = await createVideo({
    scottyResourceId,
    frontendUploadId,
    initialMetadata: {
      title: {
        newTitle: metadata.title,
      },
      description: {
        newDescription: metadata.description,
      },
      privacy: {
        newPrivacy: metadata.privacy,
      },
      draftState: {
        isDraft: false,
      },
    },
  });

  async function handleFeedback(item) {
    if (item.contents) {
      console.log("-".repeat(64));
      for (const content of item.contents) {
        console.log(JSON.stringify(content, null, 2));
      }
      console.log("-".repeat(64));
    }

    if (!item.continuations) {
      return;
    }

    const continuation = item.continuations.find(
      (c) => c.uploadFeedbackRefreshContinuation
    ).uploadFeedbackRefreshContinuation;

    await timers.setTimeout(continuation.continueInMs);

    const response = await undici.request(
      `https://studio.youtube.com/youtubei/v1/upload/feedback?alt=json&key=${ytcfg.INNERTUBE_API_KEY}`,
      {
        method: "POST",
        headers: {
          authorization: `SAPISIDHASH ${generateSAPISIDHASH()}`,
          cookie: `HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}; SID=${storage.SID}`,
          referer: YOUTUBE_STUDIO_URL,
          "x-origin": YOUTUBE_STUDIO_URL,
        },
        body: JSON.stringify({
          context: {
            ...ytcfg.INNERTUBE_CONTEXT,
            request: {
              ...ytcfg.INNERTUBE_CONTEXT.request,
              sessionInfo: {
                token: sessionToken,
              },
            },
            user: {
              ...ytcfg.INNERTUBE_CONTEXT.user,
              onBehalfOfUser: ytcfg.DELEGATED_SESSION_ID,
              delegationContext: ytcfg.DELEGATION_CONTEXT,
              serializedDelegationContext:
                ytcfg.INNERTUBE_CONTEXT_SERIALIZED_DELEGATION_CONTEXT,
            },
            clientScreenNonce: ytcfg["client-screen-nonce"],
          },
          continuations: [continuation.continuation],
        }),
        throwOnError: true,
      }
    );
    const data = await response.body.json();

    await handleFeedback(
      data.continuationContents.find((c) => c.uploadFeedbackItemContinuation)
        .uploadFeedbackItemContinuation
    );
  }

  console.log(data.contents.uploadFeedbackItemRenderer.continuations);
  await handleFeedback(data.contents.uploadFeedbackItemRenderer);
}
