// Audio helpers on ffmpeg (installed in the Docker image). Splitting uses stream copy (-c copy): no
// re-encoding, so a 90-minute lecture splits in seconds even on the dv6's CPU (spec §2.1).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { lawConfig } = require("./config");

function run(bin, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err)
          return reject(
            new Error(
              `${path.basename(bin)} failed: ${String(stderr || err.message).slice(-400)}`
            )
          );
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

/**
 * Duration in seconds. MediaRecorder WebM often has no duration header, so fall back to a stream-copy
 * pass to /dev/null and read the last reported time (no decoding).
 */
async function probeDuration(file) {
  const { ffprobePath, ffmpegPath } = lawConfig();
  try {
    const { stdout } = await run(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]);
    const d = parseFloat(stdout.trim());
    if (Number.isFinite(d) && d > 0) return d;
  } catch {
    // fall through
  }
  const { stderr } = await run(ffmpegPath, [
    "-hide_banner",
    "-i",
    file,
    "-map",
    "0:a:0",
    "-c",
    "copy",
    "-f",
    "null",
    "-",
  ]);
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!times.length) throw new Error("could not determine audio duration");
  const [, h, m, s] = times[times.length - 1];
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * Splits audio into ~segmentSec parts with stream copy. Returns [{ file, offsetSec, durationSec }] in
 * order; offsets come from the measured durations (copy-mode cuts snap to packet boundaries).
 * The caller removes `dir` when done.
 */
async function splitAudio(file, segmentSec = 600) {
  const { ffmpegPath } = lawConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-split-"));
  const ext = path.extname(file) || ".webm";
  await run(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    file,
    "-map",
    "0:a:0",
    "-c",
    "copy",
    "-f",
    "segment",
    "-segment_time",
    String(segmentSec),
    "-reset_timestamps",
    "1",
    path.join(dir, `part%03d${ext}`),
  ]);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("part"))
    .sort()
    .map((f) => path.join(dir, f));
  const parts = [];
  let offset = 0;
  for (const f of files) {
    const durationSec = await probeDuration(f);
    parts.push({ file: f, offsetSec: offset, durationSec });
    offset += durationSec;
  }
  return { dir, parts };
}

module.exports = { probeDuration, splitAudio, run };
