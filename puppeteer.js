import puppeteer from "puppeteer";

const HSID = "";
const SSID = "";
const APISID = "";
const SAPISID = "";
const SID = "";

const browser = await puppeteer.launch({
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

await page.setUserAgent(
  (await browser.userAgent()).replace("HeadlessChrome", "Chrome")
);
await page.setRequestInterception(true);
await page.setCookie(
  {
    name: "HSID",
    value: HSID,
    domain: ".youtube.com",
  },
  {
    name: "SSID",
    value: SSID,
    domain: ".youtube.com",
  },
  {
    name: "APISID",
    value: APISID,
    domain: ".youtube.com",
  },
  {
    name: "SAPISID",
    value: SAPISID,
    domain: ".youtube.com",
  },
  {
    name: "SID",
    value: SID,
    domain: ".youtube.com",
  }
);

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

    console.log(`!!! SESSION TOKEN: ${data.sessionToken}`);
    await browser.close();
  }
});

await page.goto("https://studio.youtube.com/");
