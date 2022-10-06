import crypto from "node:crypto";
import puppeteer from "puppeteer";
import undici from "undici";

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
        name: "SID",
        value: storage.SID,
        domain: ".youtube.com",
      },
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

    await page.goto("https://studio.youtube.com/");
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
      cookie: `SID=${storage.SID}; HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}`,
      origin: "https://studio.youtube.com",
      referer: "https://studio.youtube.com/",
      "user-agent": ytcfg.INNERTUBE_CONTEXT.client.userAgent.substring(
        0,
        ytcfg.INNERTUBE_CONTEXT.client.userAgent.lastIndexOf(",")
      ),
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
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      cookie: `SID=${storage.SID}; HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}`,
      origin: "https://studio.youtube.com",
      referer: "https://studio.youtube.com/",
      "user-agent": ytcfg.INNERTUBE_CONTEXT.client.userAgent.substring(
        0,
        ytcfg.INNERTUBE_CONTEXT.client.userAgent.lastIndexOf(",")
      ),
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
    .update(`${timestamp} ${storage.SAPISID} https://studio.youtube.com`)
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
        "content-type": "application/json",
        cookie: `SID=${storage.SID}; HSID=${storage.HSID}; SSID=${storage.SSID}; APISID=${storage.APISID}; SAPISID=${storage.SAPISID}`,
        origin: "https://studio.youtube.com",
        referer: "https://studio.youtube.com/",
        "user-agent": ytcfg.INNERTUBE_CONTEXT.client.userAgent.substring(
          0,
          ytcfg.INNERTUBE_CONTEXT.client.userAgent.lastIndexOf(",")
        ),
        "x-origin": "https://studio.youtube.com",
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
            clientName: ytcfg.INNERTUBE_CLIENT_NAME,
            clientVersion: ytcfg.INNERTUBE_CLIENT_VERSION,
          },
          request: {
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
    stream,
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

  console.log(JSON.stringify(data, null, 2));
}
