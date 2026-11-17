// Long clips for video-to-video apps that hold every frame in memory (upscale-video, upscale-video-fast): ComfyUI
// decodes the whole clip into one tensor, so a minutes-long 1080p clip cannot run in one go. Instead: cut the clip
// (video only) into pieces sized to a frame budget, run the app on each piece in turn, join the results and put the
// original audio back. Needs ffmpeg and ffprobe on the server (the Docker image installs them).
import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { waitPatiently, type JobLike } from "./history.ts";
import type { App } from "./registry.ts";
import type { Values } from "./runner.ts";

const run = promisify(execFile);

// shortcut: a fixed list; move to an app.json field when a third app needs pieces
export const CHUNKED_APPS = new Set(["upscale-video", "upscale-video-fast"]);
/** Clips longer than this are cut into pieces; shorter ones run as one job, as before. */
export const CHUNK_OVER_SECONDS = 20;
// input pixels × frames per piece: 1280×704 × 241 frames (≈217 M) ran whole on an L40S for both upscalers
const PIXEL_FRAME_BUDGET = 200e6;
const MAX_PIXELS = 2560 * 1440;
const MAX_PIECES = 120;
// uploads are untrusted: ffmpeg may read local files only (no http, no playlists pointing elsewhere), and only real
// video containers are accepted (an HLS or concat "video" could make ffmpeg fetch URLs or read server files)
const LOCAL_ONLY = ["-protocol_whitelist", "file"];
const CONTAINERS = /^(mov,mp4,m4a,3gp,3g2,mj2|matroska,webm)$/;
const MINUTE = 60 * 1000;

export type Probe = { width: number; height: number; fps: number; duration: number; audio: boolean };

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", ...LOCAL_ONLY, "-print_format", "json", "-show_streams",
    "-show_format", file], { timeout: MINUTE });
  const d = JSON.parse(stdout) as { streams: Record<string, string | number>[]; format: { duration?: string; format_name?: string } };
  if (!CONTAINERS.test(d.format.format_name ?? "")) throw new Error(`not a supported video (${d.format.format_name ?? "unknown"})`);
  if (d.streams.some((s) => s.codec_type !== "video" && s.codec_type !== "audio")) {
    throw new Error("the clip may hold only video and audio streams (no subtitles or data)");
  }
  const v = d.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("the clip has no video stream");
  const [num, den] = String(v.avg_frame_rate || v.r_frame_rate || "24/1").split("/").map(Number);
  return {
    width: Number(v.width), height: Number(v.height), fps: den ? num / den : num || 24,
    duration: Number(d.format.duration ?? v.duration ?? 0), audio: d.streams.some((s) => s.codec_type === "audio"),
  };
}

/** Why this clip may not run, or null: the app's length limits, a resolution cap and a cap on pieces per run. */
export function checkClip(app: App, inputId: string, p: Probe): string | null {
  const [min, max] = app.inputs.find((i) => i.id === inputId)?.limits?.seconds ?? [1, 600];
  if (p.duration < min) return `the clip must be at least ${min} s`;
  if (p.duration > max) return `the clip must be at most ${max} s (it is ${Math.round(p.duration)} s)`;
  if (p.width * p.height > MAX_PIXELS) return `the clip must be at most 2560×1440 (it is ${p.width}×${p.height})`;
  if (Math.ceil(p.duration / chunkSeconds(p)) > MAX_PIECES) return `the clip would need over ${MAX_PIECES} pieces: shorten it or lower its resolution or frame rate`;
  return null;
}

/** Seconds per piece: as long as fits the frame budget, between 2 and 20. */
export function chunkSeconds(p: Probe): number {
  return Math.max(2, Math.min(20, Math.floor(PIXEL_FRAME_BUDGET / (p.width * p.height * p.fps))));
}

type Submit = (app: App, values: Values) => Promise<JobLike | Omit<JobLike, "events" | "progress" | "queuePosition">>;

export async function runChunked(o: {
  app: App; values: Values; inputId: string; input: string; workDir: string; submit: Submit;
  seconds?: number; onJob?: (job: { cancel(): Promise<unknown> }) => void; onProgress?: (done: number, total: number) => void;
  isCanceled?: () => boolean;
}): Promise<{ file: string; gpuSeconds: number }> {
  mkdirSync(o.workDir, { recursive: true });
  const seconds = o.seconds ?? chunkSeconds(await probe(o.input));
  // re-encode (near-lossless) with a keyframe at every cut, so pieces are exactly `seconds` long and join cleanly
  await run("ffmpeg", ["-v", "error", "-y", ...LOCAL_ONLY, "-i", o.input, "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
    "-pix_fmt", "yuv420p", "-force_key_frames", `expr:gte(t,n_forced*${seconds})`, "-f", "segment",
    "-segment_time", String(seconds), "-reset_timestamps", "1", join(o.workDir, "part-%04d.mp4")], { maxBuffer: 1 << 24, timeout: 60 * MINUTE });
  const parts = readdirSync(o.workDir).filter((f) => /^part-\d{4}\.mp4$/.test(f)).sort();
  if (!parts.length) throw new Error("could not cut the clip into pieces");

  let gpuSeconds = 0;
  const done: string[] = [];
  o.onProgress?.(0, parts.length);
  for (const [i, part] of parts.entries()) {
    if (o.isCanceled?.()) throw new Error("canceled");
    const bytes = new Uint8Array(readFileSync(join(o.workDir, part)));
    const job = await o.submit(o.app, { ...o.values, [o.inputId]: { bytes, name: part, type: "video/mp4" } });
    o.onJob?.(job);
    if (!["succeeded", "failed", "canceled", "expired"].includes(job.status)) {
      await waitPatiently(job, 6 * 3600 * 1000, 10 * 60 * 1000, (m) => console.warn(`[chunked] piece ${i + 1}: ${m}`));
    }
    if (job.status !== "succeeded") {
      throw new Error(`piece ${i + 1} of ${parts.length}: ${job.error?.message || job.status}`);
    }
    if (job.startedAt && job.completedAt) gpuSeconds += (job.completedAt.getTime() - job.startedAt.getTime()) / 1000;
    const wanted = o.app.outputs[0]?.node;
    const out = job.outputs.find((x) => x.nodeId === wanted) ?? job.outputs.find((x) => x.type === "video") ?? job.outputs[0];
    if (!out) throw new Error(`piece ${i + 1} of ${parts.length}: the job returned no video`);
    const file = `up-${String(i + 1).padStart(4, "0")}.mp4`;
    writeFileSync(join(o.workDir, file), await out.toBytes());
    done.push(file);
    o.onProgress?.(i + 1, parts.length);
  }

  writeFileSync(join(o.workDir, "list.txt"), done.map((f) => `file '${f}'\n`).join(""));
  const file = join(o.workDir, "joined.mp4");
  await run("ffmpeg", ["-v", "error", "-y", ...LOCAL_ONLY, "-f", "concat", "-safe", "0", "-i", join(o.workDir, "list.txt"),
    ...LOCAL_ONLY, "-i", o.input,
    "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", file], { maxBuffer: 1 << 24, timeout: 30 * MINUTE });
  return { file, gpuSeconds: Math.round(gpuSeconds * 10) / 10 };
}
