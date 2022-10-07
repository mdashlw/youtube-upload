import fs from "node:fs";
import YouTubeStudio, { SessionInfoManager } from "../index.js";
import cookies from "./cookies.json" assert { type: "json" };

const sessionInfo = new SessionInfoManager({
  cookies,
});
const studio = new YouTubeStudio({ sessionInfo });

await studio.init();

const videoId = await studio.upload(
  {
    fileName: "syncfootage.mp4",
    stream: fs.createReadStream("./Sync-Footage-V1-H264.mp4"),
  },
  {
    title: "Test Sync Footage",
    description: "Testing description",
    privacy: "UNLISTED",
  }
);

console.log(videoId);
