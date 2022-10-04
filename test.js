import fs from "node:fs";
import { init, upload } from "./index.js";
import cookies from "./cookies.json" assert { type: "json" };

await init(cookies);

const video = await upload(
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

console.log(video);
