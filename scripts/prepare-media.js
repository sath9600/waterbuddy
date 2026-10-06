// Converts each character's green-screen clips in source/<id>/ into trimmed, transparent WebM (VP9 + alpha)
// in assets/characters/<id>/, plus character.json for the app.
//
//   npm run prepare-media            # all characters
//   npm run prepare-media -- suriya  # just one
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const ffmpeg = require("ffmpeg-static");

const root = path.join(__dirname, "..");
const HEIGHT = 960;   // shown at up to 470 px tall, so this stays sharp on 2x displays

// Per character: display name, background green of its clips, and [output, source, start s, end s] trims —
// each clip cut to the action the app uses.
const CHARACTERS = {
  vijay: {
    name: "Vijay",
    key: "0x09EC04",
    clips: [
      ["enter",    "enter.green.mp4", 0.9, 4.4],   // facing you, happy dance-walk waving the bottle (loops)
      ["dance",    "dance.green.mp4", 0,   5.0],   // dancing with the bottle in the middle (loops)
      ["happy",    "happy.green.mp4", 1.3, 5.0],   // excited jumps after "Drinking now" (loops)
      ["sad",      "sad.green.mp4",   0.5, 2.1],   // head drops, sad face (plays once)
      ["sad-walk", "sad.green.mp4",   2.1, 5.0],   // slow sad walk (loops)
    ],
  },
  suriya: {
    name: "Suriya",
    key: "0x0BDB2D",
    clips: [
      ["enter",    "enter.green.mp4", 1.0, 5.0],
      ["dance",    "dance.green.mp4", 0.8, 5.0],
      ["happy",    "happy.green.mp4", 1.0, 5.0],
      ["sad",      "sad.green.mp4",   0.6, 2.4],
      ["sad-walk", "sad.green.mp4",   2.4, 5.0],
    ],
  },
};

const only = process.argv[2];
for (const [order, [id, character]] of Object.entries(CHARACTERS).entries()) {
  if (only && only !== id) continue;
  const outDir = path.join(root, "assets/characters", id);
  fs.mkdirSync(outDir, { recursive: true });
  const durations = {};

  for (const [name, src, start, end] of character.clips) {
    const out = path.join(outDir, `${name}.webm`);
    execFileSync(ffmpeg, [
      "-y", "-loglevel", "error",
      "-ss", String(start), "-to", String(end), "-i", path.join(root, "source", id, src),
      "-vf", `chromakey=${character.key}:0.16:0.06,despill=type=green:mix=0.6:expand=0.1,scale=-2:${HEIGHT}`,
      "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
      "-crf", "34", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
      out,
    ], { stdio: "inherit" });
    durations[name] = +(end - start).toFixed(2);
    console.log(`✔ ${path.relative(root, out)}`);
  }

  fs.writeFileSync(path.join(outDir, "character.json"), JSON.stringify({ name: character.name, order, durations }, null, 2) + "\n");
}
