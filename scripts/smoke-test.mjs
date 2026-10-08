#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Lumen deployment.
 *
 *   node scripts/smoke-test.mjs https://lumen-api-x4be.onrender.com
 *   node scripts/smoke-test.mjs https://… --seed-demo   # also (re)creates the demo account's data
 *
 * Exercises the flows the brief requires: register, login, /me, project and task CRUD,
 * search and filters, dashboard counters, cross-user isolation, validation, mobile refresh
 * rotation, logout revocation and the web app shell. Exits non-zero on the first failure.
 */
const base = (process.argv[2] ?? process.env.LUMEN_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const seedDemo = process.argv.includes('--seed-demo');
let passed = 0;

function check(condition, label, detail) {
  if (!condition) {
    console.error(`✗ ${label}`);
    if (detail !== undefined)
      console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
    process.exit(1);
  }
  passed += 1;
  console.log(`✓ ${label}`);
}

async function call(method, path, { token, body, platform = 'mobile', expect } = {}) {
  const headers = { Accept: 'application/json', 'X-Client-Platform': platform };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (expect !== undefined && res.status !== expect) {
    check(false, `${method} ${path} → ${expect}`, { status: res.status, body: json });
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function waitForServer() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res.json();
    } catch {
      /* free tier waking up */
    }
    console.log(`… waiting for ${base} (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  check(false, 'server reachable');
}

const today = new Date();
const day = (offset) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

console.log(`Smoke testing ${base}\n`);
const health = await waitForServer();
check(health.status === 'ok' && health.database === 'up', 'health: API and database up', health);

const shell = await fetch(`${base}/`);
const html = await shell.text();
check(shell.ok && html.includes('<div id="root">'), 'web app served at /');
check(
  Boolean(shell.headers.get('content-security-policy')),
  'web app sends a Content-Security-Policy',
);
const spa = await fetch(`${base}/projects/some-deep-link`);
check(
  spa.ok && (await spa.text()).includes('<div id="root">'),
  'client-side routes fall back to index.html',
);
const docs = await fetch(`${base}/api/docs/`);
check(docs.ok, 'Swagger UI served at /api/docs');

const stamp = Date.now().toString(36);
const password = 'Smoke2026check';
const alice = await call('POST', '/api/auth/register', {
  body: { fullName: 'Smoke Alice', email: `smoke.alice.${stamp}@example.com`, password },
  expect: 201,
});
check(alice.body.accessToken && alice.body.refreshToken, 'register returns tokens (mobile client)');
check(!JSON.stringify(alice.body).includes('password'), 'register response has no password fields');

const dup = await call('POST', '/api/auth/register', {
  body: { fullName: 'Dup', email: `SMOKE.ALICE.${stamp}@EXAMPLE.COM`, password },
});
check(dup.status === 409, 'duplicate email (any case) rejected with 409', dup.body);

const bad = await call('POST', '/api/auth/login', {
  body: { email: `smoke.alice.${stamp}@example.com`, password: 'wrong-pass-1' },
});
check(
  bad.status === 401 && bad.body.error.code === 'INVALID_CREDENTIALS',
  'wrong password rejected',
);

const webLogin = await call('POST', '/api/auth/login', {
  platform: 'web',
  body: { email: `smoke.alice.${stamp}@example.com`, password },
  expect: 200,
});
const cookie = webLogin.headers.get('set-cookie') ?? '';
check(
  /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie),
  'web login sets HttpOnly Secure SameSite=Strict cookie',
  cookie,
);
check(
  webLogin.body.refreshToken === undefined,
  'web login does not expose the refresh token in the body',
);

const A = alice.body.accessToken;
const me = await call('GET', '/api/auth/me', { token: A, expect: 200 });
check(me.body.user.email === `smoke.alice.${stamp}@example.com`, '/me returns the signed-in user');
check((await call('GET', '/api/projects')).status === 401, 'protected route without token → 401');

const invalid = await call('POST', '/api/projects', {
  token: A,
  body: {
    name: '  ',
    status: 'DONE',
    startDate: '2026-10-10',
    endDate: '2026-10-01',
    ownerId: 'x',
  },
});
check(
  invalid.status === 400 && invalid.body.error.details.length >= 3,
  'invalid project rejected with field details',
  invalid.body,
);

const project = await call('POST', '/api/projects', {
  token: A,
  body: {
    name: 'Smoke spectrometer',
    description: 'smoke',
    status: 'IN_PROGRESS',
    startDate: day(-3),
    endDate: day(30),
  },
  expect: 201,
});
const P = project.body.data.id;
const t1 = await call('POST', '/api/tasks', {
  token: A,
  body: { projectId: P, name: 'Align laser', priority: 'HIGH', dueDate: day(-1) },
  expect: 201,
});
await call('POST', '/api/tasks', {
  token: A,
  body: { projectId: P, name: 'Write report', priority: 'LOW' },
  expect: 201,
});
check(t1.body.data.isOverdue === true, 'task due yesterday is flagged overdue');

const done = await call('PUT', `/api/tasks/${t1.body.data.id}`, {
  token: A,
  body: { status: 'COMPLETED' },
  expect: 200,
});
check(
  done.body.data.status === 'COMPLETED' && done.body.data.completedAt,
  'task marked completed with completedAt',
);

const search = await call('GET', '/api/tasks?search=ALIGN&status=COMPLETED&priority=HIGH', {
  token: A,
  expect: 200,
});
check(search.body.meta.total === 1, 'task search + status + priority filters');
const projFilter = await call('GET', '/api/projects?search=spectro&status=IN_PROGRESS', {
  token: A,
  expect: 200,
});
check(projFilter.body.meta.total === 1, 'project search + status filter');

const dash = await call('GET', '/api/dashboard', { token: A, expect: 200 });
check(
  dash.body.data.totalProjects === 1 &&
    dash.body.data.totalTasks === 2 &&
    dash.body.data.completedTasks === 1 &&
    dash.body.data.pendingTasks === 1 &&
    dash.body.data.projectsInProgress === 1,
  'dashboard counters correct',
  dash.body.data,
);

const bob = await call('POST', '/api/auth/register', {
  body: { fullName: 'Smoke Bob', email: `smoke.bob.${stamp}@example.com`, password },
  expect: 201,
});
const B = bob.body.accessToken;
check(
  (await call('GET', `/api/projects/${P}`, { token: B })).status === 404,
  "other user's project → 404",
);
check(
  (await call('PUT', `/api/projects/${P}`, { token: B, body: { name: 'pwned' } })).status === 404,
  'other user cannot update project',
);
check(
  (await call('DELETE', `/api/tasks/${t1.body.data.id}`, { token: B })).status === 404,
  'other user cannot delete task',
);
check(
  (await call('POST', '/api/tasks', { token: B, body: { projectId: P, name: 'intrude' } }))
    .status === 404,
  'other user cannot add task to project',
);
const bobDash = await call('GET', '/api/dashboard', { token: B, expect: 200 });
check(bobDash.body.data.totalProjects === 0, "other user's dashboard is empty");

const refreshed = await call('POST', '/api/auth/refresh', {
  body: { refreshToken: alice.body.refreshToken },
  expect: 200,
});
check(
  refreshed.body.refreshToken && refreshed.body.refreshToken !== alice.body.refreshToken,
  'refresh rotates the refresh token',
);

await call('POST', '/api/auth/logout', { token: refreshed.body.accessToken, expect: 204 });
const afterLogout = await call('GET', '/api/auth/me', { token: refreshed.body.accessToken });
check(
  afterLogout.status === 401 && afterLogout.body.error.code === 'SESSION_EXPIRED',
  'logout revokes the session immediately',
);

await call('DELETE', `/api/projects/${P}`, { token: A, expect: 204 });
check(
  (await call('GET', '/api/tasks', { token: A, expect: 200 })).body.meta.total === 0,
  'deleting a project deletes its tasks',
);

if (seedDemo) {
  const email = 'demo@lumen.dev';
  const demoPassword = 'LumenDemo2026';
  let session = await call('POST', '/api/auth/login', { body: { email, password: demoPassword } });
  if (session.status === 401) {
    session = await call('POST', '/api/auth/register', {
      body: { fullName: 'Demo Researcher', email, password: demoPassword },
      expect: 201,
    });
  }
  const T = session.body.accessToken;
  const existing = await call('GET', '/api/projects?limit=100', { token: T, expect: 200 });
  for (const p of existing.body.data)
    await call('DELETE', `/api/projects/${p.id}`, { token: T, expect: 204 });

  const plan = [
    [
      'Raman spectroscopy rig',
      'Bench prototype for label-free tissue classification using a 785 nm excitation laser.',
      'IN_PROGRESS',
      -21,
      40,
      [
        ['Align 785 nm laser to the objective', 'COMPLETED', 'HIGH', -10],
        ['Characterise CCD dark current at -60 °C', 'COMPLETED', 'MEDIUM', -6],
        ['Write baseline-correction routine', 'IN_PROGRESS', 'HIGH', 2],
        ['Collect reference spectra for polystyrene', 'PENDING', 'MEDIUM', 5],
        ['Order replacement notch filter', 'PENDING', 'HIGH', -2],
        ['Draft safety SOP for Class 3B laser', 'PENDING', 'LOW', 12],
      ],
    ],
    [
      'OCT imaging firmware',
      'Firmware for the swept-source optical coherence tomography scanner.',
      'IN_PROGRESS',
      -45,
      20,
      [
        ['Port galvo driver to the new MCU', 'COMPLETED', 'HIGH', -20],
        ['Add k-clock resampling on FPGA', 'IN_PROGRESS', 'HIGH', 1],
        ['Fix frame drop at 200 kHz A-scan rate', 'IN_PROGRESS', 'MEDIUM', 4],
        ['Expose scan presets over USB', 'PENDING', 'LOW', 15],
      ],
    ],
    [
      'Clinical study data portal',
      'Secure web portal for uploading and reviewing imaging study data.',
      'NOT_STARTED',
      7,
      90,
      [
        ['Define de-identification rules', 'PENDING', 'HIGH', 9],
        ['Choose object storage and retention policy', 'PENDING', 'MEDIUM', 14],
        ['Sketch reviewer workflow', 'PENDING', 'LOW', null],
      ],
    ],
    [
      'Fluorescence microscope calibration',
      'Quarterly calibration of the widefield fluorescence microscope.',
      'COMPLETED',
      -60,
      -30,
      [
        ['Measure flat-field with uniform slide', 'COMPLETED', 'MEDIUM', -40],
        ['Verify filter cube transmission', 'COMPLETED', 'MEDIUM', -38],
        ['Publish calibration report', 'COMPLETED', 'LOW', -31],
      ],
    ],
  ];
  for (const [name, description, status, start, end, tasks] of plan) {
    const created = await call('POST', '/api/projects', {
      token: T,
      platform: 'web',
      body: { name, description, status, startDate: day(start), endDate: day(end) },
      expect: 201,
    });
    for (const [taskName, taskStatus, priority, due] of tasks) {
      await call('POST', '/api/tasks', {
        token: T,
        platform: 'web',
        body: {
          projectId: created.body.data.id,
          name: taskName,
          status: taskStatus,
          priority,
          dueDate: due === null ? null : day(due),
        },
        expect: 201,
      });
    }
  }
  const demoDash = await call('GET', '/api/dashboard', { token: T, expect: 200 });
  check(
    demoDash.body.data.totalProjects === 4 && demoDash.body.data.totalTasks === 16,
    'demo account seeded (4 projects, 16 tasks)',
  );
  await call('POST', '/api/auth/logout', { token: T });
}

console.log(`\nAll ${passed} checks passed against ${base}`);
