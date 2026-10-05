// Converts the green-screen source clips in source/ into trimmed, transparent WebM (VP9 + alpha)
// in assets/media/. Run once after changing a source clip:  npm run prepare-media
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const ffmpeg = require("ffmpeg-static");

const root = path.join(__dirname, "..");
const KEY = "0x09EC04";   // background green of the Higgsfield clips
const HEIGHT = 960;       // shown at up to 470 px tall, so this stays sharp on 2x displays

// [output, source, start s, end s] — each clip trimmed to the action the app uses.
const CLIPS = [
  ["enter",    "enter.green.mp4", 0.9, 4.4],   // facing you, happy dance-walk waving the bottle (loops)
  ["dance",    "dance.green.mp4", 0,   5.0],   // dancing with the bottle in the middle (loops)
  ["happy",    "happy.green.mp4", 1.3, 5.0],   // excited jumps after "Drinking now" (loops)
  ["sad",      "sad.green.mp4",   0.5, 2.1],   // head drops, sad face (plays once)
  ["sad-walk", "sad.green.mp4",   2.1, 5.0],   // slow sad walk (loops)
];

for (const [name, src, start, end] of CLIPS) {
  const out = path.join(root, "assets/media", `${name}.webm`);
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error",
    "-ss", String(start), "-to", String(end), "-i", path.join(root, "source", src),
    "-vf", `chromakey=${KEY}:0.16:0.06,despill=type=green:mix=0.6:expand=0.1,scale=-2:${HEIGHT}`,
    "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
    "-crf", "34", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
    out,
  ], { stdio: "inherit" });
  console.log(`✔ ${path.relative(root, out)}`);
}
