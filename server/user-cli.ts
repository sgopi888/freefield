// Accounts from the server's shell: the only way to make an admin (sign-up never does).
//   npm run user -- list
//   npm run user -- add <name> [--admin]      asks for the password (or FREEFIELD_PASSWORD), no secret question
//   npm run user -- admin <name> [--off]      grant or remove admin
//   npm run user -- passwd <name>             set a new password; signs the user out everywhere
// Uses the same database as the server: <FREEFIELD_OUT or out/>/freefield.db.
import { join } from "node:path";
import { repoRoot } from "./registry.ts";
import { Accounts, AuthError } from "./accounts.ts";

const accounts = new Accounts(join(process.env.FREEFIELD_OUT || join(repoRoot(), "out"), "freefield.db"));
const [cmd, name, ...flags] = process.argv.slice(2);

/** The password from FREEFIELD_PASSWORD, or typed without echo. */
async function password(): Promise<string> {
  if (process.env.FREEFIELD_PASSWORD) return process.env.FREEFIELD_PASSWORD;
  if (!process.stdin.isTTY) throw new Error("no terminal to type the password in: set FREEFIELD_PASSWORD");
  process.stdout.write("password (8+ characters): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let typed = "";
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (buf) => {
      for (const ch of buf.toString("utf-8")) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          return resolve(typed);
        }
        if (ch === "\u0003") { process.stdin.setRawMode(false); return reject(new Error("canceled")); }
        typed = ch === "\u007f" ? typed.slice(0, -1) : typed + ch;
      }
    });
  });
}

try {
  if (cmd === "list") {
    for (const u of accounts.list()) console.log(`${u.username.padEnd(32)} ${u.admin ? "admin" : "     "}  ${u.created.slice(0, 10)}`);
  } else if (cmd === "add" && name) {
    const u = accounts.addUser(name, await password(), { admin: flags.includes("--admin") });
    console.log(`added ${u.username}${u.admin ? " (admin)" : ""}`);
  } else if (cmd === "admin" && name) {
    accounts.setAdmin(name, !flags.includes("--off"));
    console.log(`${name}: ${flags.includes("--off") ? "no longer admin" : "admin"}`);
  } else if (cmd === "passwd" && name) {
    accounts.setPassword(name, await password());
    console.log(`${name}: password changed, all sessions ended`);
  } else {
    console.log("usage: npm run user -- list | add <name> [--admin] | admin <name> [--off] | passwd <name>");
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error(e instanceof AuthError || e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
