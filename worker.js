// Ojoola API — Cloudflare Worker + D1
//
// Secrets:
// GEMINI_API_KEY
// OWNER_USER
// OWNER_PASS
// RESEND_API_KEY
//
// Variables:
// ALLOWED_ORIGIN
// APP_URL
// RESEND_FROM_EMAIL
// DAILY_LIMIT

const enc = new TextEncoder();

const PBKDF2_ITER = 10000;
const SESSION_DAYS = 14;

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const RESET_TOKEN_MS = 30 * 60 * 1000;

const DEFAULT_PERMS = {
  chat: true,
  pdf: true,
  read_aloud: true,
  live: false,
  experimental: false
};

const PERM_KEYS = Object.keys(DEFAULT_PERMS);

const EVENTS = new Set([
  "signup",
  "login",
  "ai_chat",
  "pdf_upload",
  "picture_upload",
  "read_aloud",
  "live_start",
  "support_open"
]);

/* ---------- helpers ---------- */

const hex = b =>
  [...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

const randHex = n =>
  hex(crypto.getRandomValues(new Uint8Array(n)));

const sha256 = async s =>
  hex(await crypto.subtle.digest(
    "SHA-256",
    enc.encode(s)
  ));

async function pbkdf2(pass, saltHex) {

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pass),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(saltHex),
      iterations: PBKDF2_ITER
    },
    key,
    256
  );

  return hex(bits);
}

function safeEq(a, b) {

  a = String(a);
  b = String(b);

  let d = a.length ^ b.length;

  for (
    let i = 0;
    i < Math.max(a.length, b.length);
    i++
  ) {
    d |=
      (a.charCodeAt(i) || 0) ^
      (b.charCodeAt(i) || 0);
  }

  return d === 0;
}

const permsOf = u => ({
  ...DEFAULT_PERMS,
  ...JSON.parse(u.perms || "{}")
});

const today = () =>
  new Date().toISOString().slice(0, 10);

function cors(env) {

  return {
    "Access-Control-Allow-Origin":
      env.ALLOWED_ORIGIN || "*",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Vary": "Origin"
  };
}

const send = (env, data, status = 200) =>
  new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...cors(env)
      }
    }
  );

const fail = (
  env,
  msg,
  status = 400,
  nested = false
) =>
  send(
    env,
    {
      error: nested
        ? { message: msg }
        : msg
    },
    status
  );


/* ---------- sessions ---------- */

async function newSession(env, userId, role) {

  const token = randHex(32);

  const exp =
    Date.now() +
    SESSION_DAYS * 864e5;

  await env.DB
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,role,expires_at) VALUES(?,?,?,?)"
    )
    .bind(
      await sha256(token),
      userId,
      role,
      exp
    )
    .run();

  return token;
}


async function auth(req, env) {

  const h =
    req.headers.get("Authorization") || "";

  const token =
    h.startsWith("Bearer ")
      ? h.slice(7)
      : "";

  if (!token) {
    return {
      err: "Please sign in.",
      code: 401
    };
  }

  const s = await env.DB
    .prepare(
      "SELECT * FROM sessions WHERE token_hash=?"
    )
    .bind(await sha256(token))
    .first();

  if (
    !s ||
    s.expires_at < Date.now()
  ) {

    return {
      err: "Session expired. Please sign in again.",
      code: 401
    };
  }

  if (s.role === "admin") {

    return {
      admin: true,
      id: 0,
      role: "admin",

      perms: {
        ...DEFAULT_PERMS,
        live: true,
        experimental: true
      }
    };
  }

  const u = await env.DB
    .prepare(
      "SELECT * FROM users WHERE id=?"
    )
    .bind(s.user_id)
    .first();

  if (!u) {

    return {
      err: "Account no longer exists.",
      code: 401
    };
  }

  if (u.status !== "active") {

    return {
      err:
        "Your account is " +
        u.status +
        ". Contact the owner.",
      code: 403
    };
  }

  return {
    admin: false,
    id: u.id,
    role: u.role,
    user: u,
    perms: permsOf(u)
  };
}


const publicUser = u => ({

  id: u.id,

  firstName:
    u.first_name,

  username:
    u.username,

  email:
    u.email,

  role:
    u.role,

  status:
    u.status,

  perms:
    permsOf(u),

  createdAt:
    u.created_at,

  lastLogin:
    u.last_login
});


/* ---------- activity ---------- */

async function log(env, userId, event) {

  try {

    await env.DB
      .prepare(
        "INSERT INTO activity(user_id,event,ts) VALUES(?,?,?)"
      )
      .bind(
        userId,
        event,
        Date.now()
      )
      .run();

  } catch (_) {}
}


/* ---------- usage ---------- */

async function bump(env, userId) {

  const r = await env.DB
    .prepare(
      `INSERT INTO usage(user_id,day,n)
       VALUES(?,?,1)
       ON CONFLICT(user_id,day)
       DO UPDATE SET n=n+1
       RETURNING n`
    )
    .bind(
      userId,
      today()
    )
    .first();

  return r
    ? r.n
    : 1;
}


/* ---------- tester passcode ---------- */

function makePasscode() {

  const h =
    randHex(12).toUpperCase();

  return h
    .match(/.{4}/g)
    .join("-");
}


/* ---------- password reset ---------- */

function resetLink(env, token) {

  const app =
    String(
      env.APP_URL || ""
    ).replace(/\/+$/, "");

  return (
    app +
    "/login.html?resetToken=" +
    encodeURIComponent(token)
  );
}


async function sendResetEmail(
  env,
  email,
  token
) {

  if (!env.RESEND_API_KEY) {

    throw new Error(
      "RESEND_API_KEY is not configured."
    );
  }

  if (!env.RESEND_FROM_EMAIL) {

    throw new Error(
      "RESEND_FROM_EMAIL is not configured."
    );
  }

  const link =
    resetLink(env, token);

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " +
            env.RESEND_API_KEY,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          from:
            env.RESEND_FROM_EMAIL,

          to: [email],

          subject:
            "Reset your Ọjọ́ọ̀la password",

          html: `
<!doctype html>
<html>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
  <h2>Reset your Ọjọ́ọ̀la password</h2>

  <p>
    We received a request to reset the password
    for your Ọjọ́ọ̀la account.
  </p>

  <p>
    This link expires in 30 minutes and can only
    be used once.
  </p>

  <p>
    <a
      href="${link}"
      style="
        display:inline-block;
        background:#2563EB;
        color:white;
        text-decoration:none;
        padding:12px 20px;
        border-radius:8px;
        font-weight:bold;
      "
    >
      Reset password
    </a>
  </p>

  <p>
    If you did not request this, you can ignore
    this email.
  </p>

  <p>
    — Ọjọ́ọ̀la AI Study Partner
  </p>
</body>
</html>
`
        })
      }
    );

  if (!response.ok) {

    const data =
      await response
        .json()
        .catch(() => ({}));

    throw new Error(
      data.message ||
      "Email service failed."
    );
  }
}


/* ---------- forgot password ---------- */

async function forgotPassword(
  req,
  env
) {

  const b =
    await req.json()
      .catch(() => ({}));

  const email =
    String(
      b.email || ""
    )
      .trim()
      .toLowerCase();

  /*
    Always return the same public response.
    This prevents people from discovering
    which email addresses have accounts.
  */
  const generic = {
    message:
      "If an account exists for this email, a password reset link has been sent."
  };

  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  ) {

    return send(
      env,
      generic
    );
  }

  const u =
    await env.DB
      .prepare(
        "SELECT * FROM users WHERE email=?"
      )
      .bind(email)
      .first();

  if (!u) {

    return send(
      env,
      generic
    );
  }

  /*
    Invalidate previous unused reset tokens
    for this account.
  */
  await env.DB
    .prepare(
      "UPDATE password_resets SET used=1 WHERE user_id=? AND used=0"
    )
    .bind(u.id)
    .run();

  const token =
    randHex(32);

  const tokenHash =
    await sha256(token);

  const expiresAt =
    Date.now() +
    RESET_TOKEN_MS;

  await env.DB
    .prepare(
      `INSERT INTO password_resets
       (user_id,token_hash,expires_at,used,created_at)
       VALUES(?,?,?,?,?)`
    )
    .bind(
      u.id,
      tokenHash,
      expiresAt,
      0,
      Date.now()
    )
    .run();

  try {

    await sendResetEmail(
      env,
      u.email,
      token
    );

  } catch (e) {

    /*
      Do not leave a usable token
      if email delivery failed.
    */
    await env.DB
      .prepare(
        "UPDATE password_resets SET used=1 WHERE token_hash=?"
      )
      .bind(tokenHash)
      .run();

    return fail(
      env,
      "Unable to send the password reset email right now. Please try again later.",
      503
    );
  }

  return send(
    env,
    generic
  );
}


/* ---------- reset password ---------- */

async function resetPassword(
  req,
  env
) {

  const b =
    await req.json()
      .catch(() => ({}));

  const token =
    String(
      b.token || ""
    ).trim();

  const password =
    String(
      b.password || ""
    );

  if (!token) {

    return fail(
      env,
      "Invalid or missing reset token."
    );
  }

  if (password.length < 8) {

    return fail(
      env,
      "Password must be at least 8 characters."
    );
  }

  const tokenHash =
    await sha256(token);

  const reset =
    await env.DB
      .prepare(
        "SELECT * FROM password_resets WHERE token_hash=?"
      )
      .bind(tokenHash)
      .first();

  if (
    !reset ||
    reset.used ||
    reset.expires_at < Date.now()
  ) {

    return fail(
      env,
      "This password reset link is invalid or has expired.",
      400
    );
  }

  const salt =
    randHex(16);

  const hash =
    await pbkdf2(
      password,
      salt
    );

  await env.DB
    .prepare(
      `UPDATE users
       SET pass_hash=?,
           pass_salt=?,
           fail_count=0,
           locked_until=0
       WHERE id=?`
    )
    .bind(
      hash,
      salt,
      reset.user_id
    )
    .run();

  /*
    Mark this reset token as used.
  */
  await env.DB
    .prepare(
      "UPDATE password_resets SET used=1 WHERE id=?"
    )
    .bind(reset.id)
    .run();

  /*
    Password change invalidates all
    existing sessions for this user.
  */
  await env.DB
    .prepare(
      "DELETE FROM sessions WHERE user_id=?"
    )
    .bind(reset.user_id)
    .run();

  return send(
    env,
    {
      ok: true,
      message:
        "Your password has been updated. You can now sign in."
    }
  );
}


/* ---------- routes ---------- */

export default {

  async fetch(req, env) {

    if (
      req.method === "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status: 204,
          headers: cors(env)
        }
      );
    }

    const url =
      new URL(req.url);

    const p =
      url.pathname;

    try {

      /* ---- public ---- */

      if (
        p === "/api/signup" &&
        req.method === "POST"
      )
        return signup(req, env);

      if (
        p === "/api/login" &&
        req.method === "POST"
      )
        return login(req, env);

      if (
        p === "/api/admin/login" &&
        req.method === "POST"
      )
        return adminLogin(req, env);

      if (
        p === "/api/forgot-password" &&
        req.method === "POST"
      )
        return forgotPassword(req, env);

      if (
        p === "/api/reset-password" &&
        req.method === "POST"
      )
        return resetPassword(req, env);


      /* ---- signed-in ---- */

      const a =
        await auth(req, env);

      if (a.err)
        return fail(
          env,
          a.err,
          a.code,
          p === "/api/gemini"
        );


      if (p === "/api/me") {

        return send(
          env,
          a.admin
            ? {
                role: "admin",
                perms: a.perms
              }
            : {
                ...publicUser(a.user)
              }
        );
      }


      if (
        p === "/api/logout" &&
        req.method === "POST"
      ) {

        const h =
          req.headers
            .get("Authorization")
            .slice(7);

        await env.DB
          .prepare(
            "DELETE FROM sessions WHERE token_hash=?"
          )
          .bind(
            await sha256(h)
          )
          .run();

        return send(
          env,
          { ok: true }
        );
      }


      if (
        p === "/api/track" &&
        req.method === "POST"
      ) {

        const { event } =
          await req.json()
            .catch(() => ({}));

        if (!EVENTS.has(event))
          return fail(
            env,
            "Unknown event"
          );

        if (!a.admin)
          await log(
            env,
            a.id,
            event
          );

        return send(
          env,
          { ok: true }
        );
      }


      /* ---- support messages ---- */

      if (
        p === "/api/messages" &&
        req.method === "GET"
      ) {

        if (a.admin) {

          const { results } =
            await env.DB
              .prepare(
                `SELECT
                   m.id,
                   m.user_id,
                   m.sender,
                   m.body,
                   m.ts,
                   m.read,
                   u.username,
                   u.first_name
                 FROM messages m
                 LEFT JOIN users u
                   ON u.id=m.user_id
                 ORDER BY m.ts DESC
                 LIMIT 300`
              )
              .all();

          return send(
            env,
            {
              messages: results
            }
          );
        }

        const { results } =
          await env.DB
            .prepare(
              `SELECT
                 id,
                 user_id,
                 sender,
                 body,
                 ts,
                 read
               FROM messages
               WHERE user_id=?
               ORDER BY ts ASC
               LIMIT 200`
            )
            .bind(a.id)
            .all();

        return send(
          env,
          {
            messages: results
          }
        );
      }


      if (
        p === "/api/messages" &&
        req.method === "POST"
      ) {

        const body =
          String(
            (await req.json()
              .catch(() => ({}))).body ||
            ""
          )
            .trim()
            .slice(0, 5000);

        if (!body)
          return fail(
            env,
            "Message cannot be empty."
          );

        const userId =
          a.admin
            ? Number(
                (await req.json()
                  .catch(() => ({}))).userId
              )
            : a.id;

        /*
          Admin replies are handled below
          using /api/admin/messages/reply.
        */
        if (a.admin) {

          return fail(
            env,
            "Use the admin reply endpoint."
          );
        }

        await env.DB
          .prepare(
            `INSERT INTO messages
             (user_id,sender,body,ts,read)
             VALUES(?,?,?,?,0)`
          )
          .bind(
            userId,
            "user",
            body,
            Date.now()
          )
          .run();

        await log(
          env,
          a.id,
          "support_open"
        );

        return send(
          env,
          { ok: true }
        );
      }


      if (
        p === "/api/gemini" &&
        req.method === "POST"
      )
        return gemini(
          req,
          env,
          a,
          url
        );


      if (
        p === "/api/live-token" &&
        req.method === "POST"
      )
        return liveToken(
          env,
          a
        );


      /* ---- owner only ---- */

      if (
        p.startsWith("/api/admin/")
      ) {

        if (!a.admin)
          return fail(
            env,
            "Not found",
            404
          );

        return adminRoutes(
          req,
          env,
          p,
          url
        );
      }


      return fail(
        env,
        "Not found",
        404
      );

    } catch (e) {

      return fail(
        env,
        "Server error: " +
        (e.message || e),
        500
      );
    }
  }
};


/* ---------- signup ---------- */

async function signup(
  req,
  env
) {

  const b =
    await req.json()
      .catch(() => ({}));

  const first =
    String(
      b.firstName || ""
    )
      .trim()
      .slice(0, 40);

  const username =
    String(
      b.username || ""
    ).trim();

  const email =
    String(
      b.email || ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      b.password || ""
    );

  if (!first)
    return fail(
      env,
      "Enter your first name."
    );

  if (
    !/^[A-Za-z0-9_]{3,20}$/
      .test(username)
  )
    return fail(
      env,
      "Username must be 3–20 letters, numbers or underscores."
    );

  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/
      .test(email)
  )
    return fail(
      env,
      "Enter a valid email address."
    );

  if (
    password.length < 8
  )
    return fail(
      env,
      "Password must be at least 8 characters."
    );

  const salt =
    randHex(16);

  const hash =
    await pbkdf2(
      password,
      salt
    );

  let id;

  try {

    const r =
      await env.DB
        .prepare(
          `INSERT INTO users
           (first_name,username,email,
            pass_hash,pass_salt,created_at)
           VALUES(?,?,?,?,?,?)`
        )
        .bind(
          first,
          username,
          email,
          hash,
          salt,
          Date.now()
        )
        .run();

    id =
      r.meta.last_row_id;

  } catch (e) {

    return fail(
      env,
      "That username or email is already registered.",
      409
    );
  }

  await log(
    env,
    id,
    "signup"
  );

  const u =
    await env.DB
      .prepare(
        "SELECT * FROM users WHERE id=?"
      )
      .bind(id)
      .first();

  return send(
    env,
    {
      token:
        await newSession(
          env,
          id,
          u.role
        ),

      user:
        publicUser(u)
    }
  );
}


/* ---------- login ---------- */

async function login(
  req,
  env
) {

  const b =
    await req.json()
      .catch(() => ({}));

  const ident =
    String(
      b.identifier || ""
    ).trim();

  const password =
    String(
      b.password || ""
    );

  const passcode =
    String(
      b.passcode || ""
    )
      .trim()
      .toUpperCase();

  const bad =
    "Incorrect username/email or password.";

  const u =
    await env.DB
      .prepare(
        "SELECT * FROM users WHERE username=?1 OR email=?1"
      )
      .bind(ident)
      .first();

  if (!u) {

    await pbkdf2(
      password,
      "0".repeat(32)
    );

    return fail(
      env,
      bad,
      401
    );
  }

  if (
    u.locked_until >
    Date.now()
  ) {

    return fail(
      env,
      "Too many attempts. Try again in a few minutes.",
      429
    );
  }

  const ok =
    safeEq(
      await pbkdf2(
        password,
        u.pass_salt
      ),
      u.pass_hash
    );

  if (!ok) {

    const n =
      u.fail_count + 1;

    await env.DB
      .prepare(
        `UPDATE users
         SET fail_count=?,
             locked_until=?
         WHERE id=?`
      )
      .bind(
        n >= MAX_FAILS
          ? 0
          : n,

        n >= MAX_FAILS
          ? Date.now() + LOCK_MS
          : 0,

        u.id
      )
      .run();

    return fail(
      env,
      bad,
      401
    );
  }

  if (
    u.status === "revoked"
  )
    return fail(
      env,
      "Your access has been revoked. Contact the owner.",
      403
    );

  if (
    u.status === "suspended"
  )
    return fail(
      env,
      "Your account is suspended. Contact the owner.",
      403
    );

  if (
    u.role === "tester"
  ) {

    if (!u.passcode_hash)
      return fail(
        env,
        "No tester passcode has been issued to you yet.",
        403
      );

    if (!passcode)
      return fail(
        env,
        "Enter your tester passcode.",
        401
      );

    if (
      !safeEq(
        await sha256(
          u.id +
          ":" +
          passcode
        ),
        u.passcode_hash
      )
    ) {

      const n =
        u.fail_count + 1;

      await env.DB
        .prepare(
          `UPDATE users
           SET fail_count=?,
               locked_until=?
           WHERE id=?`
        )
        .bind(
          n >= MAX_FAILS
            ? 0
            : n,

          n >= MAX_FAILS
            ? Date.now() + LOCK_MS
            : 0,

          u.id
        )
        .run();

      return fail(
        env,
        "Incorrect tester passcode.",
        401
      );
    }
  }

  await env.DB
    .prepare(
      `UPDATE users
       SET fail_count=0,
           locked_until=0,
           last_login=?
       WHERE id=?`
    )
    .bind(
      Date.now(),
      u.id
    )
    .run();

  await log(
    env,
    u.id,
    "login"
  );

  return send(
    env,
    {
      token:
        await newSession(
          env,
          u.id,
          u.role
        ),

      user:
        publicUser(u)
    }
  );
}


/* ---------- admin login ---------- */

async function adminLogin(
  req,
  env
) {

  const b =
    await req.json()
      .catch(() => ({}));

  if (
    !env.OWNER_USER ||
    !env.OWNER_PASS
  )
    return fail(
      env,
      "Owner login is not configured.",
      500
    );

  const ok =
    safeEq(
      b.username || "",
      env.OWNER_USER
    ) &
    safeEq(
      b.password || "",
      env.OWNER_PASS
    );

  if (!ok)
    return fail(
      env,
      "Incorrect owner credentials.",
      401
    );

  return send(
    env,
    {
      token:
        await newSession(
          env,
          0,
          "admin"
        )
    }
  );
}


/* ---------- Gemini proxy ---------- */

async function gemini(
  req,
  env,
  a,
  url
) {

  if (!a.perms.chat)
    return fail(
      env,
      "AI chat is not enabled for your account.",
      403,
      true
    );

  const model =
    url.searchParams.get(
      "model"
    ) || "";

  if (
    !/^gemini-[a-z0-9.\-]+$/i
      .test(model)
  )
    return fail(
      env,
      "Model not allowed.",
      400,
      true
    );

  const raw =
    await req.text();

  if (
    raw.length >
    25 * 1024 * 1024
  )
    return fail(
      env,
      "Request too large.",
      413,
      true
    );

  if (
    /inline_data|inlineData/
      .test(raw) &&
    !a.perms.pdf
  )
    return fail(
      env,
      "Study files (PDF/pictures) are not enabled for your account.",
      403,
      true
    );

  if (!a.admin) {

    const n =
      await bump(
        env,
        a.id
      );

    if (
      n >
      Number(
        env.DAILY_LIMIT ||
        150
      )
    )
      return fail(
        env,
        "Daily AI limit reached. Try again tomorrow.",
        429,
        true
      );
  }

  if (
    !url.searchParams.has("quiet") &&
    !a.admin
  )
    await log(
      env,
      a.id,
      "ai_chat"
    );

  const stream =
    url.searchParams.get(
      "stream"
    ) === "1";

  const target =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    (
      stream
        ? ":streamGenerateContent?alt=sse"
        : ":generateContent"
    );

  const r =
    await fetch(
      target,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            env.GEMINI_API_KEY
        },

        body: raw
      }
    );

  return new Response(
    r.body,
    {
      status: r.status,

      headers: {
        "Content-Type":
          r.headers.get(
            "Content-Type"
          ) ||
          "application/json",

        ...cors(env)
      }
    }
  );
}


/* ---------- Live AI ---------- */

async function liveToken(
  env,
  a
) {

  if (!a.perms.live)
    return fail(
      env,
      "Live conversation is not enabled for your account.",
      403
    );

  if (!a.admin)
    await log(
      env,
      a.id,
      "live_start"
    );

  const now =
    Date.now();

  const r =
    await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            env.GEMINI_API_KEY
        },

        body: JSON.stringify({
          uses: 1,

          expireTime:
            new Date(
              now +
              30 * 60 * 1000
            ).toISOString(),

          newSessionExpireTime:
            new Date(
              now +
              60 * 1000
            ).toISOString()
        })
      }
    );

  const d =
    await r.json()
      .catch(() => ({}));

  if (
    !r.ok ||
    !d.name
  )
    return fail(
      env,
      (
        d.error &&
        d.error.message
      ) ||
      "Could not create a live session.",
      502
    );

  return send(
    env,
    {
      token:
        d.name
    }
  );
}


/* ---------- admin API ---------- */

async function adminRoutes(
  req,
  env,
  p,
  url
) {

  const b =
    req.method === "POST"
      ? await req.json()
          .catch(() => ({}))
      : {};


  /* ----- users ----- */

  if (
    p === "/api/admin/users"
  ) {

    const { results } =
      await env.DB
        .prepare(
          "SELECT * FROM users ORDER BY created_at DESC"
        )
        .all();

    return send(
      env,
      {
        users:
          results.map(
            publicUser
          ),

        defaults:
          DEFAULT_PERMS
      }
    );
  }


  /* ----- activity ----- */

  if (
    p === "/api/admin/activity"
  ) {

    const { results } =
      await env.DB
        .prepare(
          `SELECT
             a.id,
             a.event,
             a.ts,
             a.user_id,
             u.username,
             u.first_name
           FROM activity a
           LEFT JOIN users u
             ON u.id=a.user_id
           ORDER BY a.ts DESC
           LIMIT 200`
        )
        .all();

    return send(
      env,
      {
        activity:
          results
      }
    );
  }


  /* ----- support messages ----- */

  if (
    p === "/api/admin/messages"
  ) {

    const { results } =
      await env.DB
        .prepare(
          `SELECT
             m.id,
             m.user_id,
             m.sender,
             m.body,
             m.ts,
             m.read,
             u.username,
             u.first_name
           FROM messages m
           LEFT JOIN users u
             ON u.id=m.user_id
           ORDER BY m.ts DESC
           LIMIT 300`
        )
        .all();

    return send(
      env,
      {
        messages:
          results
      }
    );
  }


  /* ----- reply to user ----- */

  if (
    p === "/api/admin/messages/reply"
  ) {

    const userId =
      Number(
        b.userId
      );

    const body =
      String(
        b.body || ""
      )
        .trim()
        .slice(0, 5000);

    if (!userId)
      return fail(
        env,
        "Missing user id."
      );

    if (!body)
      return fail(
        env,
        "Message cannot be empty."
      );

    const u =
      await env.DB
        .prepare(
          "SELECT id FROM users WHERE id=?"
        )
        .bind(userId)
        .first();

    if (!u)
      return fail(
        env,
        "User not found.",
        404
      );

    await env.DB
      .prepare(
        `INSERT INTO messages
         (user_id,sender,body,ts,read)
         VALUES(?,?,?,?,0)`
      )
      .bind(
        userId,
        "admin",
        body,
        Date.now()
      )
      .run();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  /* ----- mark message read ----- */

  if (
    p === "/api/admin/messages/read"
  ) {

    const messageId =
      Number(
        b.id
      );

    if (!messageId)
      return fail(
        env,
        "Missing message id."
      );

    await env.DB
      .prepare(
        "UPDATE messages SET read=1 WHERE id=?"
      )
      .bind(messageId)
      .run();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  /* ----- user-specific actions ----- */

  const id =
    Number(
      b.id
    );

  if (!id)
    return fail(
      env,
      "Missing user id."
    );

  const u =
    await env.DB
      .prepare(
        "SELECT * FROM users WHERE id=?"
      )
      .bind(id)
      .first();

  if (!u)
    return fail(
      env,
      "User not found.",
      404
    );


  const killSessions =
    () =>
      env.DB
        .prepare(
          "DELETE FROM sessions WHERE user_id=?"
        )
        .bind(id)
        .run();


  /* ----- status ----- */

  if (
    p === "/api/admin/status"
  ) {

    if (
      ![
        "active",
        "suspended",
        "revoked"
      ].includes(b.status)
    )
      return fail(
        env,
        "Bad status."
      );

    await env.DB
      .prepare(
        "UPDATE users SET status=? WHERE id=?"
      )
      .bind(
        b.status,
        id
      )
      .run();

    if (
      b.status !== "active"
    )
      await killSessions();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  /* ----- permissions ----- */

  if (
    p === "/api/admin/perms"
  ) {

    const clean = {};

    for (
      const k of PERM_KEYS
    ) {

      if (
        typeof
        (b.perms || {})[k]
        === "boolean"
      )
        clean[k] =
          b.perms[k];
    }

    await env.DB
      .prepare(
        "UPDATE users SET perms=? WHERE id=?"
      )
      .bind(
        JSON.stringify(clean),
        id
      )
      .run();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  /* ----- create/reset tester passcode ----- */

  if (
    p === "/api/admin/make-tester" ||
    p === "/api/admin/passcode"
  ) {

    const code =
      makePasscode();

    await env.DB
      .prepare(
        `UPDATE users
         SET role='tester',
             passcode_hash=?
         WHERE id=?`
      )
      .bind(
        await sha256(
          id +
          ":" +
          code
        ),
        id
      )
      .run();

    /*
      This immediately invalidates
      the tester's existing sessions.
      Other users are unaffected.
    */
    await killSessions();

    return send(
      env,
      {
        passcode:
          code
      }
    );
  }


  /* ----- remove tester role ----- */

  if (
    p === "/api/admin/make-user"
  ) {

    await env.DB
      .prepare(
        `UPDATE users
         SET role='user',
             passcode_hash=NULL
         WHERE id=?`
      )
      .bind(id)
      .run();

    await killSessions();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  /* ----- delete user ----- */

  if (
    p === "/api/admin/delete"
  ) {

    await killSessions();

    await env.DB
      .prepare(
        "DELETE FROM users WHERE id=?"
      )
      .bind(id)
      .run();

    await env.DB
      .prepare(
        "DELETE FROM activity WHERE user_id=?"
      )
      .bind(id)
      .run();

    await env.DB
      .prepare(
        "DELETE FROM messages WHERE user_id=?"
      )
      .bind(id)
      .run();

    await env.DB
      .prepare(
        "DELETE FROM usage WHERE user_id=?"
      )
      .bind(id)
      .run();

    await env.DB
      .prepare(
        "DELETE FROM password_resets WHERE user_id=?"
      )
      .bind(id)
      .run();

    return send(
      env,
      {
        ok: true
      }
    );
  }


  return fail(
    env,
    "Not found",
    404
  );
}
