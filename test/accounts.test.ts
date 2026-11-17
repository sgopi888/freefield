import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Accounts, AuthError } from "../server/accounts.ts";

const fresh = (opts: ConstructorParameters<typeof Accounts>[1] = {}) =>
  new Accounts(join(mkdtempSync(join(tmpdir(), "ff-acc-")), "freefield.db"), opts);
const SIGNUP = { username: "Alice", password: "correct horse", question: "First pet?", answer: " Rex " };

function throwsStatus(fn: () => unknown, status: number, msg?: RegExp) {
  assert.throws(fn, (e: unknown) => e instanceof AuthError && e.status === status && (!msg || msg.test(e.message)));
}

test("sign-up validates input, lower-cases the name and never makes an admin", () => {
  const a = fresh();
  throwsStatus(() => a.signup({ ...SIGNUP, password: "short" }), 400, /8 characters/);
  throwsStatus(() => a.signup({ ...SIGNUP, username: "a b" }), 400, /username/);
  throwsStatus(() => a.signup({ ...SIGNUP, username: "ab" }), 400, /username/);
  throwsStatus(() => a.signup({ ...SIGNUP, question: "" }), 400, /question/);
  throwsStatus(() => a.signup({ ...SIGNUP, answer: "  " }), 400, /answer/);
  const u = a.signup(SIGNUP);
  assert.deepEqual({ username: u.username, admin: u.admin }, { username: "alice", admin: false });
  throwsStatus(() => a.signup({ ...SIGNUP, username: "ALICE" }), 409, /taken/);
});

test("passwords and answers are stored hashed, never in clear", () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-acc-"));
  const a = new Accounts(join(dir, "freefield.db"));
  a.signup(SIGNUP);
  const row = a.rawUser("alice")!;
  assert.ok(!JSON.stringify(row).includes("correct horse"));
  assert.ok(!JSON.stringify(row).toLowerCase().includes("rex"));
  assert.match(String(row.pw_hash), /^scrypt\$/);
});

test("login gives a session token that authenticates via the cookie; logout ends it", () => {
  const a = fresh();
  a.signup(SIGNUP);
  throwsStatus(() => a.login("alice", "wrong password", "1.1.1.1"), 401);
  throwsStatus(() => a.login("nobody", "whatever1", "1.1.1.1"), 401);
  const { token, user } = a.login("ALICE", "correct horse", "1.1.1.1");
  assert.equal(user.username, "alice");
  assert.equal(a.authenticate(`x=1; ff_session=${token}`, undefined)?.username, "alice");
  assert.equal(a.authenticate("ff_session=forged", undefined), null);
  assert.equal(a.authenticate(undefined, undefined), null);
  a.logout(token);
  assert.equal(a.authenticate(`ff_session=${token}`, undefined), null);
});

test("sessions expire after 30 days", () => {
  let now = new Date("2026-11-01T00:00:00Z");
  const a = fresh({ now: () => now });
  a.signup(SIGNUP);
  const { token } = a.login("alice", "correct horse", "ip");
  now = new Date("2026-11-30T23:00:00Z");
  assert.ok(a.authenticate(`ff_session=${token}`, undefined));
  now = new Date("2026-12-02T00:00:00Z");
  assert.equal(a.authenticate(`ff_session=${token}`, undefined), null);
});

test("the session cookie is HttpOnly, SameSite=Lax, Secure only over HTTPS", () => {
  const a = fresh();
  assert.match(a.sessionCookie("tok", false), /^ff_session=tok; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  assert.match(a.sessionCookie("tok", true), /; Secure$/);
  assert.match(a.clearCookie(false), /Max-Age=0/);
});

test("reset by secret question: wrong answer refused, right answer sets the password and ends sessions", () => {
  const a = fresh();
  a.signup(SIGNUP);
  assert.equal(a.question("ALICE"), "First pet?");
  assert.equal(a.question("nobody"), null);
  const { token } = a.login("alice", "correct horse", "ip");
  throwsStatus(() => a.reset({ username: "alice", answer: "Max", password: "new password" }, "ip"), 401);
  throwsStatus(() => a.reset({ username: "alice", answer: "rex", password: "short" }, "ip"), 400, /8 characters/);
  const key = a.createKey(a.list().find((x) => x.username === "alice")!, "script").key;
  a.reset({ username: "alice", answer: "  REX", password: "new password" }, "ip");
  assert.equal(a.authenticate(`ff_session=${token}`, undefined), null);
  assert.equal(a.authenticate(undefined, `Bearer ${key}`), null);   // a reset also revokes API keys
  throwsStatus(() => a.login("alice", "correct horse", "ip"), 401);
  assert.ok(a.login("alice", "new password", "ip").token);
});

test("10 failed attempts per username or per IP in 15 minutes lock out with 429", () => {
  let now = new Date("2026-11-01T00:00:00Z");
  const a = fresh({ now: () => now });
  a.signup(SIGNUP);
  for (let i = 0; i < 10; i++) throwsStatus(() => a.login("alice", "wrong pass", "10.0.0.1"), 401);
  throwsStatus(() => a.login("alice", "correct horse", "10.0.0.1"), 429);   // that username from that IP
  assert.ok(a.login("alice", "correct horse", "10.9.9.9").token);           // others cannot lock alice out
  for (let i = 0; i < 9; i++) throwsStatus(() => a.login("alice", "wrong pass", `10.1.0.${i}`), 401);
  a.signup({ ...SIGNUP, username: "bob" });
  for (let i = 0; i < 10; i++) throwsStatus(() => a.login(`ghost${i}`, "wrong pass", "6.6.6.6"), 401);
  throwsStatus(() => a.login("bob", "correct horse", "6.6.6.6"), 429);      // by IP, even for another user
  now = new Date("2026-11-01T00:16:00Z");
  assert.ok(a.login("alice", "correct horse", "10.0.0.1").token);
});

test("API keys: shown once, authenticate as Bearer, listed without the secret, revocable", () => {
  const a = fresh();
  const u = a.signup(SIGNUP);
  const k = a.createKey(u, "yt-daily-stream");
  assert.match(k.key, /^ff_[A-Za-z0-9_-]{32}$/);
  assert.equal(a.authenticate(undefined, `Bearer ${k.key}`)?.username, "alice");
  assert.equal(a.authenticate(undefined, "Bearer ff_nope"), null);
  assert.equal(a.authenticate(undefined, `Basic ${k.key}`), null);
  const listed = a.keys(u);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].label, "yt-daily-stream");
  assert.ok(!JSON.stringify(listed).includes(k.key));
  assert.ok(listed[0].last_used);
  const other = a.signup({ ...SIGNUP, username: "bob" });
  assert.equal(a.revokeKey(other, k.id), false);   // not bob's key
  assert.equal(a.revokeKey(u, k.id), true);
  assert.equal(a.authenticate(undefined, `Bearer ${k.key}`), null);
});

test("reserving a run counts against the cap at once; a released reservation does not", () => {
  const a = fresh({ runsPerDay: 1 });
  const u = a.signup(SIGNUP);
  const r = a.reserveRun(u, "video-t2v");
  assert.throws(() => a.reserveRun(u, "video-t2v"), (e: unknown) => e instanceof AuthError && e.status === 429);
  a.releaseRun(r);
  const r2 = a.reserveRun(u, "video-t2v");
  a.bindRun(r2, "run-1");
  a.finishRun("run-1", 30, "succeeded");
  assert.deepEqual(a.usage(u).runs.map((x) => [x.run_id, x.gpu_seconds]), [["run-1", 30]]);
});

test("runs are capped per user per UTC day; admins are not capped", () => {
  let now = new Date("2026-11-01T23:00:00Z");
  const a = fresh({ now: () => now, runsPerDay: 2 });
  const u = a.signup(SIGNUP);
  assert.equal(a.refuseRun(u), null);
  a.recordRun(u, "r1", "video-t2v");
  a.recordRun(u, "r2", "video-t2v");
  assert.match(a.refuseRun(u)!, /2 runs for today/);
  now = new Date("2026-11-02T00:01:00Z");
  assert.equal(a.refuseRun(u), null);
  const admin = a.addUser("boss", "admin password", { admin: true });
  for (let i = 0; i < 5; i++) a.recordRun(admin, `a${i}`, "video-t2v");
  assert.equal(a.refuseRun(admin), null);
});

test("usage sums GPU seconds and dollars per day and month; admin sees every user", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const a = fresh({ now: () => now, usdPerHour: 1.8 });
  const u = a.signup(SIGNUP);
  const b = a.signup({ ...SIGNUP, username: "bob" });
  a.recordRun(u, "r1", "video-t2v");
  a.finishRun("r1", 120, "succeeded");
  a.recordRun(u, "r2", "upscale-video-fast");
  a.finishRun("r2", 60, "failed");
  a.recordRun(b, "r3", "video-t2v");
  a.finishRun("r3", 3600, "succeeded");
  const mine = a.usage(u);
  assert.deepEqual(mine.today, { runs: 2, gpu_seconds: 180, usd: 0.09 });
  assert.deepEqual(mine.month, { runs: 2, gpu_seconds: 180, usd: 0.09 });
  assert.equal(mine.runs.length, 2);
  assert.equal(mine.users, undefined);
  const boss = a.addUser("boss", "admin password", { admin: true });
  const all = a.usage(boss);
  assert.deepEqual(all.users!.map((x) => [x.username, x.month.gpu_seconds]), [["alice", 180], ["bob", 3600], ["boss", 0]]);
  assert.equal(all.users!.find((x) => x.username === "bob")!.month.usd, 1.8);
  assert.equal(fresh().usage(fresh().signup(SIGNUP)).today.usd, null);   // no rate configured → no dollars
});

test("admin is only made from code: addUser/setAdmin, never sign-up", () => {
  const a = fresh();
  a.signup(SIGNUP);
  a.setAdmin("alice", true);
  assert.equal(a.list().find((x) => x.username === "alice")!.admin, true);
  a.setAdmin("alice", false);
  assert.equal(a.list().find((x) => x.username === "alice")!.admin, false);
  throwsStatus(() => a.setAdmin("nobody", true), 404);
  const key = a.createKey(a.list().find((x) => x.username === "alice")!).key;
  a.setPassword("alice", "replaced pw");
  assert.equal(a.authenticate(undefined, `Bearer ${key}`), null);
  assert.ok(a.login("alice", "replaced pw", "ip").token);
});

// ---------------------------------------------------------------- the server with FREEFIELD_ACCOUNTS=1

async function startServer(extra: Record<string, string> = {}) {
  const out = mkdtempSync(join(tmpdir(), "ff-srv-"));
  const port = String(40000 + Math.floor(Math.random() * 20000));
  const child = spawn(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/server.ts"], {
    env: { PATH: process.env.PATH, PORT: port, FREEFIELD_OUT: out, FREEFIELD_ACCOUNTS: "1", ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 15000);
    child.stdout.on("data", (d) => { if (String(d).includes("freefield on")) { clearTimeout(t); resolve(); } });
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const call = (path: string, init: RequestInit = {}) => fetch(base + path, init);
  return { out, call, stop: () => child.kill() };
}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("server: the API needs a session or a key; pages and auth routes stay open", async () => {
  const s = await startServer();
  try {
    assert.equal((await s.call("/api/apps")).status, 401);
    assert.equal((await s.call("/")).status, 200);
    assert.equal((await s.call("/account.html")).status, 200);

    const signup = await s.call("/api/auth/signup", json(SIGNUP));
    assert.equal(signup.status, 201);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    assert.match(cookie, /^ff_session=/);
    const me = await (await s.call("/api/auth/me", { headers: { cookie } })).json();
    assert.deepEqual(me, { username: "alice", admin: false });
    assert.equal((await s.call("/api/apps", { headers: { cookie } })).status, 200);

    assert.equal((await s.call("/api/auth/login", json({ username: "alice", password: "nope nope" }))).status, 401);
    const q = await (await s.call("/api/auth/question?username=alice")).json();
    assert.equal(q.question, "First pet?");

    const key = await (await s.call("/api/keys", { ...json({ label: "script" }), headers: { cookie, "content-type": "application/json" } })).json();
    const bearer = { authorization: `Bearer ${key.key}` };
    assert.equal((await s.call("/api/apps", { headers: bearer })).status, 200);
    assert.equal((await s.call("/api/jobs/x", { headers: bearer })).status, 403);   // raw jobs: admin only
    const usage = await (await s.call("/api/usage", { headers: bearer })).json();
    assert.deepEqual(usage.today, { runs: 0, gpu_seconds: 0, usd: null });
    assert.equal((await s.call(`/api/keys/${key.id}`, { method: "DELETE", headers: { cookie } })).status, 200);
    assert.equal((await s.call("/api/apps", { headers: bearer })).status, 401);

    assert.equal((await s.call("/api/auth/logout", { method: "POST", headers: { cookie } })).status, 200);
    assert.equal((await s.call("/api/apps", { headers: { cookie } })).status, 401);
  } finally {
    s.stop();
  }
});

test("server: without FREEFIELD_ACCOUNTS nothing changes", async () => {
  const s = await startServer({ FREEFIELD_ACCOUNTS: "" });
  try {
    assert.equal((await s.call("/api/apps")).status, 200);
    assert.equal((await s.call("/api/auth/me")).status, 404);
  } finally {
    s.stop();
  }
});
