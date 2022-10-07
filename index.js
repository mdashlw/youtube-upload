import events from "node:events";
import crypto from "node:crypto";
import undici from "undici";
import puppeteer from "puppeteer";

export class SessionInfoManager extends events.EventEmitter {
  constructor({ cookies, fetchInterval }) {
    super();
    this.cookies = cookies;
    this.token = null;

    if (fetchInterval) {
      setInterval(this.fetch, fetchInterval);
    }

    this.on("ytcfg", (ytcfg) => {
      this.userAgent = ytcfg.INNERTUBE_CONTEXT.client.userAgent.substring(
        0,
        ytcfg.INNERTUBE_CONTEXT.client.userAgent.lastIndexOf(",")
      );
    });
  }

  async fetch() {
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
          value: this.cookies.SID,
          domain: ".youtube.com",
        },
        {
          name: "HSID",
          value: this.cookies.HSID,
          domain: ".youtube.com",
        },
        {
          name: "SSID",
          value: this.cookies.SSID,
          domain: ".youtube.com",
        },
        {
          name: "APISID",
          value: this.cookies.APISID,
          domain: ".youtube.com",
        },
        {
          name: "SAPISID",
          value: this.cookies.SAPISID,
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
              url.pathname.endsWith(
                "/creator_studio_mod_binary_core_v2.js"
              ))) ||
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

          this.token = data.sessionToken;
          await browser.close();
          resolve();
        }
      });

      await page.goto("https://studio.youtube.com/");
      this.emit("ytcfg", await page.evaluate(() => ytcfg.data_));
    });
  }

  generateSAPISIDHASH() {
    const timestamp = Date.now();
    const hash = crypto
      .createHash("sha1")
      .update(`${timestamp} ${this.cookies.SAPISID} https://studio.youtube.com`)
      .digest("hex");

    return `${timestamp}_${hash}`;
  }

  headers({ authorization = false } = {}) {
    return {
      authorization: authorization
        ? `SAPISIDHASH ${this.generateSAPISIDHASH()}`
        : undefined,
      cookie: `SID=${this.cookies.SID}; HSID=${this.cookies.HSID}; SSID=${this.cookies.SSID}; APISID=${this.cookies.APISID}; SAPISID=${this.cookies.SAPISID}`,
      origin: "https://studio.youtube.com",
      referer: "https://studio.youtube.com/",
      "user-agent": this.userAgent,
      "x-origin": "https://studio.youtube.com",
    };
  }
}

export class ScottyUploader {
  constructor({ sessionInfo }, { scottyUrl }) {
    this.sessionInfo = sessionInfo;
    this.scottyUrl = scottyUrl;
  }

  async start(frontendUploadId, { fileName }) {
    const response = await undici.request(this.scottyUrl, {
      method: "POST",
      headers: {
        ...this.sessionInfo.headers(),
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-goog-upload-command": "start",
        "x-goog-upload-file-name": fileName,
        "x-goog-upload-protocol": "resumable",
      },
      body: JSON.stringify({ frontendUploadId }),
      throwOnError: true,
    });

    return response.headers["x-goog-upload-url"];
  }

  async uploadAndFinalize(uploadUrl, { fileName, stream }) {
    const response = await undici.request(uploadUrl, {
      method: "POST",
      headers: {
        ...this.sessionInfo.headers(),
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
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
}

export default class YouTubeStudio {
  constructor({ sessionInfo }) {
    this.sessionInfo = sessionInfo;

    sessionInfo.on("ytcfg", (ytcfg) => {
      this.ytcfg = ytcfg;
      this.scotty = new ScottyUploader({ sessionInfo }, ytcfg.UPLOAD_CONFIG);
    });
  }

  async init() {
    await this.sessionInfo.fetch();
  }

  generateFrontendUploadId() {
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

  async createVideo({ scottyResourceId, frontendUploadId, initialMetadata }) {
    const response = await undici.request(
      `https://studio.youtube.com/youtubei/v1/upload/createvideo?alt=json&key=${this.ytcfg.INNERTUBE_API_KEY}`,
      {
        method: "POST",
        headers: {
          ...this.sessionInfo.headers({ authorization: true }),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channelId: this.ytcfg.CHANNEL_ID,
          resourceId: {
            scottyResourceId: {
              id: scottyResourceId,
            },
          },
          frontendUploadId,
          initialMetadata,
          context: {
            client: {
              clientName: this.ytcfg.INNERTUBE_CLIENT_NAME,
              clientVersion: this.ytcfg.INNERTUBE_CLIENT_VERSION,
            },
            request: {
              sessionInfo: {
                token: this.sessionInfo.token,
              },
            },
            user: {
              onBehalfOfUser: this.ytcfg.DELEGATED_SESSION_ID,
              delegationContext: this.ytcfg.DELEGATION_CONTEXT,
              serializedDelegationContext:
                this.ytcfg.INNERTUBE_CONTEXT_SERIALIZED_DELEGATION_CONTEXT,
            },
            clientScreenNonce: this.ytcfg["client-screen-nonce"],
          },
          delegationContext: this.ytcfg.DELEGATION_CONTEXT,
        }),
        throwOnError: true,
      }
    );
    const data = await response.body.json();

    return data;
  }

  async upload({ fileName, stream }, metadata) {
    const frontendUploadId = this.generateFrontendUploadId();
    const uploadUrl = await this.scotty.start(frontendUploadId, {
      fileName,
    });
    const scottyResourceId = await this.scotty.uploadAndFinalize(uploadUrl, {
      fileName,
      stream,
    });
    const data = await this.createVideo({
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

    return data.videoId;
  }
}
