# Ojoola backend: free setup (about 15 minutes)

Everything below uses free plans only: Cloudflare Workers, Cloudflare D1 and a Gemini API free-tier key.

## 1. Install and log in
```
npm install -g wrangler
wrangler login
```

## 2. Create the database
```
wrangler d1 create ojoola
```
Copy the `database_id` it prints into `wrangler.toml`. Then:
```
wrangler d1 execute ojoola --remote --file=schema.sql
```

## 3. Add secrets (never put these in any HTML/JS file)
```
wrangler secret put GEMINI_API_KEY    # use a NEW key from Google AI Studio
wrangler secret put OWNER_USER        # your private owner username
wrangler secret put OWNER_PASS        # a long, unique password
```

## 4. Deploy
```
wrangler deploy
```
Note the address it prints, e.g. `https://ojoola-api.yourname.workers.dev`.

## 5. Connect the app
1. Put `login.html` and `ojoola-core.js` in the same folder as `index.html`.
2. In `ojoola-core.js`, set `API` to your Worker address.
3. In `index.html`, add this as the first line inside `<head>`:
   `<script src="ojoola-core.js"></script>`
4. Add `login.html` and `ojoola-core.js` to the file list in your `service-worker.js` cache if it uses one.

No other changes to `index.html` are needed. The core script does these things:
- It redirects to the login page when there is no session.
- It sends Gemini and Live calls through your Worker.
- It removes the API-key card from Settings.
- It adds a Sign out button.
- It hides features the account lacks.
- It sends activity events (names only).

## 6. Rotate the old key
The old key sat in browser storage, so create a fresh key in Google AI Studio and delete the old one.

## Becoming a tester (until admin.html exists)
Call the owner API with the owner token:
```
curl -X POST $API/api/admin/login -d '{"username":"...","password":"..."}'
curl -X POST $API/api/admin/make-tester -H "Authorization: Bearer TOKEN" -d '{"id":2}'
```
The response contains the one-time passcode. Passing the same call again resets it. Other endpoints: `/api/admin/users`, `/status`, `/perms`, `/delete`, `/activity`.

## Free-plan limits to know
- Workers: 100,000 requests/day, 10 ms CPU per request.
- D1: 5 GB storage, about 100,000 writes/day.
- Gemini free tier: shared rate limits across all your users, and Google may use free-tier prompts to improve its products. Avoid sensitive material.
- `DAILY_LIMIT` (default 150 AI requests per user per day) in `wrangler.toml` stops one tester from using up the shared quota.
