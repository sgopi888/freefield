# Accounts, API keys and usage

For a server shared with a few people. Off by default: without `FREEFIELD_ACCOUNTS=1` the server behaves as before.

## Turn it on (`.env`)

```bash
FREEFIELD_ACCOUNTS=1
FREEFIELD_USER_RUNS_PER_DAY=20      # per non-admin user, per UTC day
FREEFIELD_GPU_USD_PER_HOUR=1.95     # Modal L40S list price; used for the $ estimate (unset → no dollars)
```

Data lives in `<FREEFIELD_OUT or out/>/freefield.db` (SQLite). Back it up like any database.

## Admins (only from the server's shell)

Sign-up never creates an admin. On the machine that runs the server, in the repo:

```bash
npm run user -- add <name> --admin     # new admin; asks for the password (or FREEFIELD_PASSWORD=…)
npm run user -- admin <name>           # make an existing account admin
npm run user -- admin <name> --off     # remove admin
npm run user -- passwd <name>          # new password; ends that user's sessions and revokes their API keys
npm run user -- list
```

Admins have no daily cap, see every user's usage on `/account.html`, and can use `/api/jobs` and lab marks.

## Users

- `/account.html`: sign in, create an account (username, password of 8+ characters, one secret question), or reset the
  password by answering the question. There is no email.
- The same page shows today's and this month's runs, GPU time and $ estimate, and manages API keys.

## Scripts

Create a key on `/account.html` (shown once), then:

```bash
curl -H "Authorization: Bearer ff_…" -F prompt="calm lake at dawn" -F duration=10 \
  https://<host>/api/apps/video-t2v/run              # → 202 {"id": "<run id>", …}
curl -H "Authorization: Bearer ff_…" https://<host>/api/history/<run id>             # status, outputs
curl -H "Authorization: Bearer ff_…" -O https://<host>/api/history/<run id>/files/<file>
curl -H "Authorization: Bearer ff_…" https://<host>/api/usage
```

Runs made with a key count as that user's.

## Behind nginx

```nginx
proxy_set_header X-Real-IP $remote_addr;        # login lockout is per client IP (X-Forwarded-For is ignored)
proxy_set_header X-Forwarded-Proto $scheme;     # the session cookie is Secure only over HTTPS
client_max_body_size 100m;                      # match FREEFIELD_MAX_UPLOAD_MB
```

## Limits worth knowing

- Failed sign-ins and resets lock out per client, per (user, client) and per account (see `server/accounts.ts`). The
  counters are in memory, so a restart clears them.
- The $ estimate covers GPU execution time only. Cold starts and the idle minutes before the GPU scales down are not
  charged to anyone, so compare totals with the Modal dashboard.
