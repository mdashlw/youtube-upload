import fs from "node:fs";
import upload from "./index.js";

const video = await upload(
  {
    fileName: "syncfootage.mp4",
    stream: fs.createReadStream("./test.mp4"),
  },
  {
    channelId: "",
    metadata: {
      title: "Test",
      description: "Testing description",
      privacy: "UNLISTED",
    },
  }
);

console.log(video);
