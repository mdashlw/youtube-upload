import undici from "undici";

// TODO: fetch ytcfg
const INNERTUBE_API_KEY = "AIzaSyBUPetSUmoZL-OhlxA7wSac5XinrygCqMo";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB_CREATOR",
    clientVersion: "1.20220928.00.00",
  },
};

const HSID = "";
const SSID = "";
const SID = "";
const COOKIE = `HSID=${HSID}; SSID=${SSID}; SID=${SID}`;

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
  const response = await undici.request(
    "https://upload.youtube.com/upload/studio",
    {
      method: "POST",
      headers: {
        cookie: COOKIE,
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-goog-upload-command": "start",
        "x-goog-upload-file-name": fileName,
        "x-goog-upload-protocol": "resumable",
      },
      body: JSON.stringify({ frontendUploadId }),
      throwOnError: true,
    }
  );

  return response.headers["x-goog-upload-url"];
}

async function uploadAndFinalize(uploadUrl, { fileName, stream }) {
  const response = await undici.request(uploadUrl, {
    method: "POST",
    headers: {
      cookie: COOKIE,
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

async function createVideo({
  channelId,
  scottyResourceId,
  frontendUploadId,
  initialMetadata,
}) {
  const response = await undici.request(
    `https://studio.youtube.com/youtubei/v1/upload/createvideo?alt=json&key=${INNERTUBE_API_KEY}`,
    {
      method: "POST",
      headers: {
        cookie: COOKIE,
        "x-origin": "https://studio.youtube.com",
        Referer: "https://studio.youtube.com",
      },
      body: JSON.stringify({
        channelId,
        resourceId: {
          scottyResourceId: {
            id: scottyResourceId,
          },
        },
        frontendUploadId,
        initialMetadata,
        context: {
          ...INNERTUBE_CONTEXT,
          request: {
            sessionInfo: {
              token: "", // TODO
            },
          },
          user: {
            onBehalfOfUser: "", // TODO DELEGATED_SESSION_ID
          },
        },
      }),
      throwOnError: true,
    }
  );
  const data = await response.body.json();

  console.log(data);
}

export default async function upload(
  { fileName, stream },
  { channelId, metadata }
) {
  const frontendUploadId = generateFrontendUploadId();
  const uploadUrl = await startUpload(frontendUploadId, {
    fileName,
  });
  const scottyResourceId = await uploadAndFinalize(uploadUrl, {
    fileName,
    body: stream,
  });

  return await createVideo({
    channelId,
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
}
