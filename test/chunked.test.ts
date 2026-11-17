import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkSeconds, probe, runChunked } from "../server/chunked.ts";
import type { App } from "../server/registry.ts";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

test("piece length keeps each piece within the frame budget, between 2 and 20 s", () => {
  assert.equal(chunkSeconds({ width: 1920, height: 1080, fps: 24, duration: 300, audio: true }), 4);
  assert.equal(chunkSeconds({ width: 1280, height: 704, fps: 24, duration: 300, audio: true }), 9);
  assert.equal(chunkSeconds({ width: 320, height: 180, fps: 24, duration: 300, audio: true }), 20);
  assert.equal(chunkSeconds({ width: 3840, height: 2160, fps: 60, duration: 300, audio: true }), 2);
});

test("a long clip is split, each piece run, then joined with the original audio", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-chunk-"));
  const src = join(dir, "in.mov");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24:duration=9",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=9", "-shortest", "-c:v", "libx264", "-c:a", "aac", src]);
  const meta = await probe(src);
  assert.equal(meta.width, 320);
  assert.ok(Math.abs(meta.duration - 9) < 0.2 && meta.audio);

  const app = { id: "upscale-video-fast", inputs: [{ id: "clip", type: "video" }], outputs: [{ node: "6", type: "video" }] } as unknown as App;
  const submitted: number[] = [];
  const progress: string[] = [];
  let t = 0;
  const result = await runChunked({
    app, values: { clip: { bytes: new Uint8Array(), name: "in.mov", type: "video/quicktime" } }, inputId: "clip",
    input: src, workDir: join(dir, "work"), seconds: 3,
    submit: async (_app, values) => {
      const piece = values.clip as { bytes: Uint8Array };
      submitted.push(piece.bytes.byteLength);
      const start = new Date(t * 1000); t += 1.5;
      return {   // the "GPU" hands the piece back unchanged
        id: `job-${submitted.length}`, status: "succeeded", error: null, startedAt: start, completedAt: new Date(start.getTime() + 1500),
        outputs: [{ name: "o.mp4", type: "video", nodeId: "6", contentType: "video/mp4", toBytes: async () => piece.bytes }],
        wait: async () => undefined, cancel: async () => undefined,
      };
    },
    onProgress: (done, total) => progress.push(`${done}/${total}`),
  });
  assert.equal(submitted.length, 3);
  assert.deepEqual(progress, ["0/3", "1/3", "2/3", "3/3"]);
  assert.equal(result.gpuSeconds, 4.5);
  const out = await probe(result.file);
  assert.ok(Math.abs(out.duration - 9) < 0.3, `joined duration ${out.duration}`);
  assert.ok(out.audio, "original audio is put back");
  assert.ok(readFileSync(result.file).byteLength > 0);
});

test("a failed piece fails the whole run with that piece's error", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-chunk-"));
  const src = join(dir, "in.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=6", "-c:v", "libx264", src]);
  const app = { id: "upscale-video-fast", inputs: [{ id: "clip", type: "video" }], outputs: [{ node: "6", type: "video" }] } as unknown as App;
  let n = 0;
  await assert.rejects(runChunked({
    app, values: {}, inputId: "clip", input: src, workDir: join(dir, "work"), seconds: 3,
    submit: async () => ({
      id: `j${++n}`, status: n === 2 ? "failed" : "succeeded", error: n === 2 ? { message: "CUDA out of memory" } : null,
      startedAt: null, completedAt: null, wait: async () => undefined, cancel: async () => undefined,
      outputs: [{ name: "o.mp4", type: "video", nodeId: "6", contentType: "video/mp4", toBytes: async () => new Uint8Array([0]) }],
    }),
  }), /piece 2 of 2.*CUDA out of memory/);
});
