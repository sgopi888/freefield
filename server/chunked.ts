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

export type Probe = { width: number; height: number; fps: number; duration: number; audio: boolean };

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const d = JSON.parse(stdout) as { streams: Record<string, string | number>[]; format: { duration?: string } };
  const v = d.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("the clip has no video stream");
  const [num, den] = String(v.avg_frame_rate || v.r_frame_rate || "24/1").split("/").map(Number);
  return {
    width: Number(v.width), height: Number(v.height), fps: den ? num / den : num || 24,
    duration: Number(d.format.duration ?? v.duration ?? 0), audio: d.streams.some((s) => s.codec_type === "audio"),
  };
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
  await run("ffmpeg", ["-v", "error", "-y", "-i", o.input, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
    "-pix_fmt", "yuv420p", "-force_key_frames", `expr:gte(t,n_forced*${seconds})`, "-f", "segment",
    "-segment_time", String(seconds), "-reset_timestamps", "1", join(o.workDir, "part-%04d.mp4")], { maxBuffer: 1 << 24 });
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
  await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(o.workDir, "list.txt"), "-i", o.input,
    "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", file], { maxBuffer: 1 << 24 });
  return { file, gpuSeconds: Math.round(gpuSeconds * 10) / 10 };
}
