// Accounts for a small hosted Freefield (a few beta testers): sign-up with a username, a password and one secret
// question; sessions as a cookie; per-user API keys for scripts; a per-user daily run cap; GPU usage per user.
// On only with FREEFIELD_ACCOUNTS=1 (server.ts); everything lives in one SQLite file (<out>/freefield.db).
//   FREEFIELD_USER_RUNS_PER_DAY   runs a non-admin may start per UTC day (default 20)
//   FREEFIELD_GPU_USD_PER_HOUR    GPU price for the $ estimate (Modal L40S: 1.95); unset → no dollars shown
// Admins are made only from code (server/user-cli.ts), never by sign-up.
// Secrets at rest: passwords and answers as scrypt with a per-row salt; session tokens and API keys as SHA-256.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseCookies } from "./guard.ts";

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export type User = { id: number; username: string; admin: boolean };
export type AccountsOptions = { now?: () => Date; runsPerDay?: number; usdPerHour?: number };
type Totals = { runs: number; gpu_seconds: number; usd: number | null };

const SESSION = "ff_session";
const SESSION_DAYS = 30;
const USERNAME = /^[a-z0-9_-]{3,32}$/;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const IP_LOCK = 10;                              // failures per client, any usernames
const PAIR_LOCK = { login: 10, reset: 3 } as const;   // failures per (username, client); answers are easier to guess
// distinct failing clients per account before *new* clients must wait; one address can never trip it alone, and a
// client that signed in to the account before is never held back by it (the owner cannot be locked out from afar)
const ACCOUNT_LOCK = { login: 20, reset: 5 } as const;

/** The client as a lock key: IPv4 as is (also when IPv4-mapped), IPv6 by its /64, the block one subscriber gets. */
export function clientKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4 || !ip.includes(":")) return v4 ? v4[1] : ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
// verified against when the username does not exist, so a wrong name costs as long as a wrong password
const DUMMY_HASH = hashSecret("not a real password");

function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(secret, salt, 32).toString("hex")}`;
}

function verifySecret(secret: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = scryptSync(secret, Buffer.from(salt, "hex"), want.length);
  return timingSafeEqual(got, want);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const normAnswer = (a: string) => a.trim().toLowerCase();
const toUser = (r: Record<string, unknown>): User => ({ id: Number(r.id), username: String(r.username), admin: Boolean(r.is_admin) });

function checkPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) throw new AuthError("the password needs at least 8 characters", 400);
  if (password.length > 200) throw new AuthError("the password is too long", 400);
  return password;
}

export class Accounts {
  readonly runsPerDay: number;
  readonly usdPerHour: number | null;
  private readonly db: DatabaseSync;
  private readonly now: () => Date;
  private readonly failures = new Map<string, number[]>();
  private readonly accountFailures = new Map<string, Map<string, number>>();   // kind:name → client → last failure
  private readonly knownClients = new Set<string>();                         // name|client that signed in

  constructor(file: string, opts: AccountsOptions = {}) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.now = opts.now ?? (() => new Date());
    this.runsPerDay = opts.runsPerDay ?? 20;
    this.usdPerHour = opts.usdPerHour ?? null;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL,
        question TEXT, answer_hash TEXT, is_admin INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL, label TEXT, created TEXT NOT NULL, last_used TEXT, revoked TEXT);
      CREATE TABLE IF NOT EXISTS usage (
        run_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, app TEXT NOT NULL,
        created TEXT NOT NULL, gpu_seconds REAL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_user_created ON usage(user_id, created);
    `);
  }

  static fromEnv(file: string, env: NodeJS.ProcessEnv = process.env): Accounts {
    const runs = Number(env.FREEFIELD_USER_RUNS_PER_DAY);
    const usd = Number(env.FREEFIELD_GPU_USD_PER_HOUR);
    return new Accounts(file, { runsPerDay: runs > 0 ? runs : undefined, usdPerHour: usd > 0 ? usd : undefined });
  }

  // ------------------------------------------------------------ users

  signup(body: { username?: unknown; password?: unknown; question?: unknown; answer?: unknown }): User {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const answer = typeof body.answer === "string" ? normAnswer(body.answer) : "";
    if (question.length < 3 || question.length > 200) throw new AuthError("a secret question (3–200 characters) is needed", 400);
    if (!answer || answer.length > 200) throw new AuthError("an answer to the secret question is needed", 400);
    return this.create(body.username, body.password, { question, answer, admin: false });
  }

  /** For server/user-cli.ts: the only way to make an admin. */
  addUser(username: string, password: string, opts: { admin?: boolean; question?: string; answer?: string } = {}): User {
    return this.create(username, password, {
      admin: Boolean(opts.admin), question: opts.question?.trim() || null, answer: opts.answer ? normAnswer(opts.answer) : null,
    });
  }

  private create(username: unknown, password: unknown, o: { admin: boolean; question: string | null; answer: string | null }): User {
    const name = typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!USERNAME.test(name)) throw new AuthError("the username needs 3–32 characters: a–z, 0–9, _ or -", 400);
    const pw = checkPassword(password);
    if (this.row(name)) throw new AuthError("that username is taken", 409);
    const r = this.db.prepare(`INSERT INTO users (username, pw_hash, question, answer_hash, is_admin, created)
      VALUES (?, ?, ?, ?, ?, ?)`).run(name, hashSecret(pw), o.question, o.answer ? hashSecret(o.answer) : null,
      o.admin ? 1 : 0, this.now().toISOString());
    return { id: Number(r.lastInsertRowid), username: name, admin: o.admin };
  }

  setAdmin(username: string, admin: boolean): void {
    const r = this.db.prepare("UPDATE users SET is_admin = ? WHERE username = ?").run(admin ? 1 : 0, username.trim().toLowerCase());
    if (!r.changes) throw new AuthError(`no user ${username}`, 404);
  }

  setPassword(username: string, password: string): void {
    const r = this.row(username);
    if (!r) throw new AuthError(`no user ${username}`, 404);
    this.db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").run(hashSecret(checkPassword(password)), r.id as number);
    this.revokeAll(Number(r.id));
  }

  list(): (User & { created: string })[] {
    return this.db.prepare("SELECT * FROM users ORDER BY username").all().map((r) => ({ ...toUser(r), created: String(r.created) }));
  }

  /** The stored row, for tests and the CLI. */
  rawUser(username: string): Record<string, unknown> | undefined {
    return this.row(username);
  }

  private row(username: unknown): Record<string, unknown> | undefined {
    if (typeof username !== "string") return undefined;
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim().toLowerCase()) as Record<string, unknown> | undefined;
  }

  // ------------------------------------------------------------ sessions

  login(username: unknown, password: unknown, ip: string): { token: string; user: User } {
    const name = typeof username === "string" ? username.trim().toLowerCase() : "";
    this.throttle("login", name, ip);
    const r = this.row(name);
    const ok = verifySecret(typeof password === "string" ? password : "", r ? String(r.pw_hash) : DUMMY_HASH) && Boolean(r);
    if (!ok) {
      this.fail("login", name, ip);
      throw new AuthError("wrong username or password", 401);
    }
    this.knownClients.add(`${name}|${clientKey(ip)}`);
    return { token: this.newSession(Number(r!.id)), user: toUser(r!) };
  }

  logout(token: string | undefined): void {
    if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }

  question(username: unknown): string | null {
    const r = this.row(username);
    return r?.question ? String(r.question) : null;
  }

  reset(body: { username?: unknown; answer?: unknown; password?: unknown }, ip: string): void {
    const name = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    this.throttle("reset", name, ip);
    const pw = checkPassword(body.password);
    const r = this.row(name);
    const answer = typeof body.answer === "string" ? normAnswer(body.answer) : "";
    const ok = verifySecret(answer, r?.answer_hash ? String(r.answer_hash) : DUMMY_HASH) && Boolean(r?.answer_hash);
    if (!ok) {
      this.fail("reset", name, ip);
      throw new AuthError("that answer does not match", 401);
    }
    this.db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").run(hashSecret(pw), r!.id as number);
    this.revokeAll(Number(r!.id));
  }

  /** Who sent this request: an API key (Authorization: Bearer ff_…) or the session cookie; null when neither is valid. */
  authenticate(cookieHeader: string | undefined, authorization: string | undefined): User | null {
    if (authorization) {
      const m = /^Bearer (ff_[A-Za-z0-9_-]+)$/.exec(authorization.trim());
      if (!m) return null;
      const r = this.db.prepare(`SELECT u.*, k.id AS key_id FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ? AND k.revoked IS NULL`).get(sha256(m[1])) as Record<string, unknown> | undefined;
      if (!r) return null;
      this.db.prepare("UPDATE api_keys SET last_used = ? WHERE id = ?").run(this.now().toISOString(), r.key_id as number);
      return toUser(r);
    }
    const token = parseCookies(cookieHeader)[SESSION];
    if (!token) return null;
    const r = this.db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires > ?`).get(sha256(token), this.now().toISOString()) as Record<string, unknown> | undefined;
    return r ? toUser(r) : null;
  }

  sessionToken(cookieHeader: string | undefined): string | undefined {
    return parseCookies(cookieHeader)[SESSION];
  }

  sessionCookie(token: string, secure: boolean): string {
    return `${SESSION}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
  }

  clearCookie(secure: boolean): string {
    return `${SESSION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  }

  private newSession(userId: number): string {
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(this.now().getTime() + SESSION_DAYS * 86400 * 1000).toISOString();
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
    this.db.prepare("DELETE FROM sessions WHERE expires <= ?").run(this.now().toISOString());
    return token;
  }

  // brute-force lock within LOCK_WINDOW_MS: per client, per (username, client), and per account by distinct clients.
  // shortcut: in memory, so a restart clears it; move to the db if the server ever runs as several processes
  private throttle(kind: keyof typeof ACCOUNT_LOCK, name: string, ip: string): void {
    const since = this.now().getTime() - LOCK_WINDOW_MS;
    const c = clientKey(ip);
    for (const [k, limit] of [[`ip:${c}`, IP_LOCK], [`${kind}:${name}|${c}`, PAIR_LOCK[kind]]] as const) {
      const recent = (this.failures.get(k) ?? []).filter((t) => t > since);
      this.failures.set(k, recent);
      if (recent.length >= limit) throw new AuthError("too many failed attempts; try again in 15 minutes", 429);
    }
    if (this.knownClients.has(`${name}|${c}`)) return;
    const clients = this.accountFailures.get(`${kind}:${name}`);
    for (const [client, t] of clients ?? []) if (t <= since) clients!.delete(client);
    if ((clients?.size ?? 0) >= ACCOUNT_LOCK[kind]) {
      throw new AuthError("too many failed attempts on this account; try again in 15 minutes", 429);
    }
  }

  private fail(kind: keyof typeof ACCOUNT_LOCK, name: string, ip: string): void {
    const t = this.now().getTime();
    const c = clientKey(ip);
    for (const k of [`ip:${c}`, `${kind}:${name}|${c}`]) this.failures.set(k, [...(this.failures.get(k) ?? []), t]);
    const key = `${kind}:${name}`;
    if (!this.accountFailures.has(key)) this.accountFailures.set(key, new Map());
    this.accountFailures.get(key)!.set(c, t);
  }

  /** A new password ends every way in: sessions and API keys (a reset after a compromise must lock the intruder out). */
  private revokeAll(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    this.db.prepare("UPDATE api_keys SET revoked = ? WHERE user_id = ? AND revoked IS NULL").run(this.now().toISOString(), userId);
  }

  /** Mint a session for a user created a moment ago (sign-up logs you straight in). */
  startSession(user: User): string {
    return this.newSession(user.id);
  }

  // ------------------------------------------------------------ API keys

  createKey(user: User, label?: unknown) {
    const key = `ff_${randomBytes(24).toString("base64url")}`;
    const created = this.now().toISOString();
    const name = typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : null;
    const r = this.db.prepare("INSERT INTO api_keys (user_id, key_hash, prefix, label, created) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, sha256(key), key.slice(0, 7), name, created);
    return { id: Number(r.lastInsertRowid), key, prefix: key.slice(0, 7), label: name, created };
  }

  keys(user: User) {
    return this.db.prepare(`SELECT id, prefix, label, created, last_used FROM api_keys
      WHERE user_id = ? AND revoked IS NULL ORDER BY id`).all(user.id)
      .map((r) => ({ id: Number(r.id), prefix: String(r.prefix), label: r.label as string | null, created: String(r.created),
        last_used: r.last_used as string | null }));
  }

  revokeKey(user: User, id: number): boolean {
    return this.db.prepare("UPDATE api_keys SET revoked = ? WHERE id = ? AND user_id = ? AND revoked IS NULL")
      .run(this.now().toISOString(), id, user.id).changes > 0;
  }

  // ------------------------------------------------------------ runs and usage

  /** Why this user may not start a run now (their daily cap), or null. Admins have no cap. */
  refuseRun(user: User): string | null {
    if (user.admin) return null;
    const n = Number((this.db.prepare("SELECT COUNT(*) AS n FROM usage WHERE user_id = ? AND created >= ?")
      .get(user.id, this.dayStart()) as { n: number }).n);
    return n >= this.runsPerDay
      ? `your ${this.runsPerDay} runs for today (UTC) are used up; they reset at 00:00 UTC` : null;
  }

  /**
   * Check the cap and take a slot in one synchronous step (no await between them), so requests arriving together
   * cannot all pass. Returns a reservation id: bindRun() it to the run, or releaseRun() it when the run never starts.
   */
  reserveRun(user: User, app: string): string {
    const refused = this.refuseRun(user);
    if (refused) throw new AuthError(refused, 429);
    const id = `pending:${randomBytes(8).toString("hex")}`;
    this.recordRun(user, id, app);
    return id;
  }

  bindRun(reservation: string, runId: string): void {
    this.db.prepare("UPDATE usage SET run_id = ? WHERE run_id = ?").run(runId, reservation);
  }

  releaseRun(reservation: string): void {
    this.db.prepare("DELETE FROM usage WHERE run_id = ?").run(reservation);
  }

  recordRun(user: User, runId: string, app: string): void {
    this.db.prepare("INSERT OR IGNORE INTO usage (run_id, user_id, app, created, status) VALUES (?, ?, ?, ?, 'started')")
      .run(runId, user.id, app, this.now().toISOString());
  }

  finishRun(runId: string, gpuSeconds: number | null, status: string): void {
    this.db.prepare("UPDATE usage SET gpu_seconds = ?, status = ? WHERE run_id = ?").run(gpuSeconds, status, runId);
  }

  usage(user: User) {
    const day = this.dayStart();
    const month = `${day.slice(0, 7)}-01T00:00:00.000Z`;
    const totals = (userId: number, since: string): Totals => {
      const r = this.db.prepare(`SELECT COUNT(*) AS runs, COALESCE(SUM(gpu_seconds), 0) AS s FROM usage
        WHERE user_id = ? AND created >= ?`).get(userId, since) as { runs: number; s: number };
      return { runs: Number(r.runs), gpu_seconds: Number(r.s), usd: this.usd(Number(r.s)) };
    };
    const runs = this.db.prepare(`SELECT run_id, app, created, gpu_seconds, status FROM usage
      WHERE user_id = ? ORDER BY created DESC LIMIT 100`).all(user.id)
      .map((r) => ({ run_id: String(r.run_id), app: String(r.app), created: String(r.created), status: String(r.status),
        gpu_seconds: r.gpu_seconds as number | null, usd: this.usd(Number(r.gpu_seconds ?? 0)) }));
    const out = {
      username: user.username, admin: user.admin, runs_per_day: user.admin ? null : this.runsPerDay,
      usd_per_hour: this.usdPerHour, today: totals(user.id, day), month: totals(user.id, month), runs,
      users: undefined as undefined | { username: string; admin: boolean; today: Totals; month: Totals }[],
    };
    if (user.admin) {
      out.users = this.list().map((u) => ({ username: u.username, admin: u.admin, today: totals(u.id, day), month: totals(u.id, month) }));
    }
    return out;
  }

  private usd(seconds: number): number | null {
    return this.usdPerHour === null ? null : Math.round((seconds * this.usdPerHour / 3600) * 10000) / 10000;
  }

  private dayStart(): string {
    return `${this.now().toISOString().slice(0, 10)}T00:00:00.000Z`;
  }
}
