const ROUTES = new Set([
  "/",
  "/admin",
  "/auth",
  "/fantasy",
  "/standings",
  "/leaderboard",
  "/profile",
  "/help",
  "/support",
  "/privacy",
  "/terms",
]);

const PROTECTED_ROUTES = new Set(["/fantasy", "/standings", "/leaderboard", "/profile", "/help"]);
const GROUPS = "ABCDEFGHIJKL".split("");
const HOME_CODES = ["USA", "CAN", "MEX"];
const SQUAD_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const STARTER_LIMITS = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const BUDGET_CAP = 130;
const FPL_GOAL_POINTS = { GK: 10, DEF: 6, MID: 5, FWD: 4 };
const FPL_CLEAN_SHEET_POINTS = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const FORMATION = [
  { position: "GK", x: 50, y: 88 },
  { position: "DEF", x: 18, y: 70 },
  { position: "DEF", x: 39, y: 72 },
  { position: "DEF", x: 61, y: 72 },
  { position: "DEF", x: 82, y: 70 },
  { position: "MID", x: 18, y: 49 },
  { position: "MID", x: 39, y: 45 },
  { position: "MID", x: 61, y: 45 },
  { position: "MID", x: 82, y: 49 },
  { position: "FWD", x: 35, y: 21 },
  { position: "FWD", x: 65, y: 21 },
];

const FLAG_CODES = {
  ALG: "dz", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BOS: "ba", BIH: "ba", BRA: "br", CAN: "ca",
  CPV: "cv", COL: "co", CRO: "hr", CUW: "cw", CZE: "cz", COD: "cd", ECU: "ec", EGY: "eg", ENG: "gb-eng",
  FRA: "fr", GER: "de", GHA: "gh", HAI: "ht", IRN: "ir", IRQ: "iq", CIV: "ci", JPN: "jp", JOR: "jo",
  MEX: "mx", MAR: "ma", NED: "nl", NZL: "nz", NOR: "no", PAN: "pa", PAR: "py", POR: "pt", QAT: "qa",
  KSA: "sa", SAU: "sa", SCO: "gb-sct", SEN: "sn", SRB: "rs", RSA: "za", KOR: "kr", ESP: "es", SUI: "ch",
  TUN: "tn", TUR: "tr", UKR: "ua", USA: "us", URU: "uy", UZB: "uz",
};

const RING_CODES = [
  "ALG", "ARG", "AUS", "AUT", "BEL", "BOS", "BRA", "CAN", "CPV", "COL", "CRO", "CUW",
  "CZE", "COD", "ECU", "EGY", "ENG", "FRA", "GER", "GHA", "HAI", "IRN", "IRQ", "CIV",
  "JPN", "JOR", "MEX", "MAR", "NED", "NZL", "NOR", "PAN", "PAR", "POR", "QAT", "KSA",
  "SEN", "SRB", "RSA", "KOR", "ESP", "SUI", "TUN", "TUR", "UKR", "SCO", "USA", "UZB",
];

const state = {
  route: normalizePath(location.pathname),
  loading: true,
  provider: null,
  publicData: {
    nations: [],
    fixtures: [],
    comingUp: { day: null, fixtures: [] },
    standings: null,
    players: [],
    managers: [],
    faqs: [],
  },
  session: {
    token: localStorage.getItem("wc26-token") || "",
    refreshToken: localStorage.getItem("wc26-refresh") || "",
    user: null,
    profile: null,
    team: null,
    leaderboard: null,
    notifications: [],
  },
  admin: {
    token: localStorage.getItem("wc26-admin-token") || "",
    user: null,
    dashboard: null,
  },
  ui: {
    toasts: [],
    modal: null,
    landingShot: 0,
    authTab: "signin",
    standingsTab: "fixtures",
    standingsGroup: 0,
    fixturesMode: "group",
    fixturesNation: "all",
    fixturesGroup: "all",
    leaderboardScope: "global",
    fantasyFilter: "ALL",
    fantasyTile: "PRICE",
    fantasySearch: "",
    activeLeagueId: "global",
    authForms: {
      signin: { email: "", password: "" },
      signup: { display_name: "", email: "", password: "" },
      reset: { email: "" },
      admin: { email: "", password: "" },
    },
    authFocus: null,
  },
  fantasyDraft: blankFantasyDraft(),
};

const appNode = document.querySelector("#app");
const overlayNode = document.querySelector("#overlay-root");
let deferredRenderTimer = null;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function normalizePath(path) {
  const normalized = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path || "/";
  return ROUTES.has(normalized) ? normalized : "/";
}

function blankFantasyDraft() {
  return {
    team_name: "",
    player_ids: [],
    manager_id: "",
    captain_id: "",
    vice_captain_id: "",
    starters: [],
    bench: [],
  };
}

function cloneDraft(source) {
  return {
    team_name: source?.team_name || "",
    player_ids: [...(source?.player_ids || [])],
    manager_id: source?.manager_id || "",
    captain_id: source?.captain_id || "",
    vice_captain_id: source?.vice_captain_id || "",
    starters: [...(source?.starters || [])],
    bench: [...(source?.bench || [])],
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeSelector(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

function withBreaks(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function flagUrl(code) {
  const normalized = FLAG_CODES[code] || String(code || "").toLowerCase().slice(0, 2);
  return `https://flagcdn.com/${normalized}.svg`;
}

function flagImg(code, alt = "", className = "flag") {
  if (!code) return `<span class="${className}" aria-hidden="true"></span>`;
  return `<img class="${className}" src="${flagUrl(code)}" alt="${escapeHtml(alt)}">`;
}

function icon(name) {
  const icons = {
    photo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"></path><path d="m7 15 3.4-3.4a1.3 1.3 0 0 1 1.8 0L15 14.4l1-1a1.3 1.3 0 0 1 1.8 0L20 15.6"></path><path d="M8.5 9.5h.01"></path></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`,
    trophy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 7H5.5a2 2 0 0 0 0 4H7"></path><path d="M17 7h1.5a2 2 0 0 1 0 4H17"></path><path d="M10 15v3"></path><path d="M14 15v3"></path><path d="M8 21h8"></path></svg>`,
    target: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
    standings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 15v-4"></path><path d="M12 15V8"></path><path d="M16 15v-6"></path></svg>`,
    fantasy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>`,
    leagues: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H3"></path><path d="M12 19H3"></path><path d="M14 3v4"></path><path d="M16 17v4"></path><path d="M21 12h-9"></path><path d="M21 19h-5"></path><path d="M21 5h-7"></path><path d="M8 10v4"></path><path d="M8 12H3"></path></svg>`,
    profile: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    chevronLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`,
    crown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 8 4.8 4.8L12 4l5.2 8.8L22 8l-2 12H4z"></path></svg>`,
    copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
    logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`,
    support: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16h.01"></path><path d="M12 8v4"></path><path d="M15.3 2a2 2 0 0 1 1.4.6l4.7 4.7a2 2 0 0 1 .6 1.4v6.6a2 2 0 0 1-.6 1.4l-4.7 4.7a2 2 0 0 1-1.4.6H8.7a2 2 0 0 1-1.4-.6l-4.7-4.7a2 2 0 0 1-.6-1.4V8.7a2 2 0 0 1 .6-1.4l4.7-4.7A2 2 0 0 1 8.7 2z"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2v4h4"></path><path d="M3 11a9 9 0 0 1 14-7l4 2"></path><path d="M7 22v-4H3"></path><path d="M21 13a9 9 0 0 1-14 7l-4-2"></path></svg>`,
    sparkles: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.9 2.6 11 7l4.4 1.1L11 9.2 9.9 13.6 8.8 9.2 4.4 8.1 8.8 7z"></path><path d="M18 12.7 18.7 15l2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"></path><path d="M16 3v2"></path><path d="M3 16h2"></path><path d="M21 8h-2"></path><path d="M5 5l1.5 1.5"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>`,
  };
  return icons[name] || "";
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.auth !== false && state.session.token) {
    headers.set("Authorization", `Bearer ${state.session.token}`);
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function adminApi(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (state.admin.token) headers.set("X-Admin-Token", state.admin.token);
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Admin request failed.");
  return payload;
}

function pushToast(kind, message) {
  const toast = { id: crypto.randomUUID(), kind, message };
  state.ui.toasts = [...state.ui.toasts, toast];
  renderOverlays();
  window.setTimeout(() => {
    state.ui.toasts = state.ui.toasts.filter((item) => item.id !== toast.id);
    renderOverlays();
  }, 3200);
}

function setSessionTokens(accessToken, refreshToken) {
  state.session.token = accessToken || "";
  state.session.refreshToken = refreshToken || "";
  if (state.session.token) {
    localStorage.setItem("wc26-token", state.session.token);
  } else {
    localStorage.removeItem("wc26-token");
  }
  if (state.session.refreshToken) {
    localStorage.setItem("wc26-refresh", state.session.refreshToken);
  } else {
    localStorage.removeItem("wc26-refresh");
  }
}

function clearSession() {
  setSessionTokens("", "");
  state.session.user = null;
  state.session.profile = null;
  state.session.team = null;
  state.session.leaderboard = null;
  state.session.notifications = [];
  state.fantasyDraft = blankFantasyDraft();
}

function setAdminToken(token) {
  state.admin.token = token || "";
  if (state.admin.token) {
    localStorage.setItem("wc26-admin-token", state.admin.token);
  } else {
    localStorage.removeItem("wc26-admin-token");
  }
}

function clearAdminSession() {
  setAdminToken("");
  state.admin.user = null;
  state.admin.dashboard = null;
}

function navigate(path, replace = false) {
  const next = normalizePath(path);
  const gated = PROTECTED_ROUTES.has(next) && !state.session.user ? "/auth" : next;
  if (replace) {
    history.replaceState({}, "", gated);
  } else if (gated !== state.route) {
    history.pushState({}, "", gated);
  }
  state.route = gated;
  render();
}

function tz() {
  return "Asia/Kolkata";
}

function formatDate(value, options = {}) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { timeZone: tz(), ...options }).format(new Date(value));
}

function formatDateShort(value) {
  return formatDate(value, { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(value) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

function money(value) {
  return `£${Number(value || 0).toFixed(1)}`;
}

function prettyJson(value) {
  return JSON.stringify(value ?? null, null, 2);
}

function initials(name) {
  const label = (name || "P").trim();
  return label.charAt(0).toUpperCase();
}

function nationMap() {
  return Object.fromEntries(state.publicData.nations.map((nation) => [nation.code, nation]));
}

function playerMap() {
  return Object.fromEntries(state.publicData.players.map((player) => [player.id, player]));
}

function managerMap() {
  return Object.fromEntries(state.publicData.managers.map((manager) => [manager.id, manager]));
}

function fantasyPlayers() {
  const players = playerMap();
  return state.fantasyDraft.player_ids.map((id) => players[id]).filter(Boolean);
}

function fantasyManager() {
  return managerMap()[state.fantasyDraft.manager_id];
}

function positionCounts(ids = state.fantasyDraft.player_ids) {
  const players = playerMap();
  return ids.reduce(
    (acc, id) => {
      const position = players[id]?.position;
      if (position && acc[position] !== undefined) acc[position] += 1;
      return acc;
    },
    { GK: 0, DEF: 0, MID: 0, FWD: 0 },
  );
}

function spentBudget() {
  const players = fantasyPlayers();
  let spent = players.reduce((sum, player) => sum + Number(player.price || 0), 0);
  if (fantasyManager()) spent += Number(fantasyManager().price || 0);
  return spent;
}

function squadProjectedPoints() {
  const players = playerMap();
  const starterIds = starterIdsFromDraft();
  const captain = players[state.fantasyDraft.captain_id];
  const multiplierId = !captain || playerPlayedForFpl(captain) ? state.fantasyDraft.captain_id : state.fantasyDraft.vice_captain_id;
  let total = 0;
  for (const id of starterIds) {
    const player = players[id];
    if (!player) continue;
    let score = playerProjection(player);
    if (id === multiplierId) score *= 2;
    total += score;
  }
  return Math.round(total);
}

function playerProjection(player) {
  return Number(player.fpl_points || 0);
}

function playerPlayedForFpl(player) {
  return Boolean(player?.fpl_played);
}

function starterIdsFromDraft() {
  const ids = state.fantasyDraft.starters.filter((id) => state.fantasyDraft.player_ids.includes(id));
  return ids.length === 11 ? ids : autoSelectStarters(state.fantasyDraft.player_ids);
}

function benchIdsFromDraft() {
  const starters = new Set(starterIdsFromDraft());
  const bench = state.fantasyDraft.bench.filter((id) => !starters.has(id) && state.fantasyDraft.player_ids.includes(id));
  if (bench.length) return bench;
  return state.fantasyDraft.player_ids.filter((id) => !starters.has(id));
}

function autoSelectStarters(playerIds) {
  const players = playerMap();
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  playerIds
    .map((id) => players[id])
    .filter(Boolean)
    .sort((a, b) => (
      Number(b.fpl_points || 0) - Number(a.fpl_points || 0)
      || Number(b.recent_form || 0) - Number(a.recent_form || 0)
      || Number(b.price || 0) - Number(a.price || 0)
    ))
    .forEach((player) => byPos[player.position].push(player.id));
  return [
    ...(byPos.GK.slice(0, 1)),
    ...(byPos.DEF.slice(0, 4)),
    ...(byPos.MID.slice(0, 4)),
    ...(byPos.FWD.slice(0, 2)),
  ];
}

function syncDraftOrdering() {
  state.fantasyDraft.starters = starterIdsFromDraft();
  state.fantasyDraft.bench = benchIdsFromDraft();
  if (!state.fantasyDraft.captain_id || !state.fantasyDraft.starters.includes(state.fantasyDraft.captain_id)) {
    state.fantasyDraft.captain_id = state.fantasyDraft.starters[0] || "";
  }
  if (
    !state.fantasyDraft.vice_captain_id ||
    !state.fantasyDraft.starters.includes(state.fantasyDraft.vice_captain_id) ||
    state.fantasyDraft.vice_captain_id === state.fantasyDraft.captain_id
  ) {
    state.fantasyDraft.vice_captain_id = state.fantasyDraft.starters.find((id) => id !== state.fantasyDraft.captain_id) || "";
  }
}

function hydrateDraft(team) {
  if (team?.player_ids?.length === 15) {
    state.fantasyDraft = cloneDraft(team);
  } else {
    state.fantasyDraft = blankFantasyDraft();
  }
  syncDraftOrdering();
}

function comingUpHtml() {
  const payload = state.publicData.comingUp;
  if (!payload.fixtures.length) return `<div class="empty-state">No upcoming fixtures are available yet.</div>`;
  return `
    <div class="heading">
      <div>
        <h2 class="neon-cyan">Coming Up</h2>
        <p class="eyebrow">${escapeHtml(formatDate(payload.fixtures[0].kickoff_at, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase())}</p>
      </div>
    </div>
    <div class="fixture-list">
      ${payload.fixtures.map((fixture) => fixtureCard(fixture, false)).join("")}
    </div>
  `;
}

function fixtureCard(fixture, clickable = true, showGroup = false) {
  const home = fixture.home_nation || nationMap()[fixture.home_nation_code];
  const away = fixture.away_nation || nationMap()[fixture.away_nation_code];
  const action = clickable && fixture.finished ? `data-action="open-fixture" data-fixture="${fixture.id}"` : "";
  const control = fixture.report_url
    ? `<a class="ghost-button accent" href="${escapeHtml(fixture.report_url)}" target="_blank" rel="noopener">Report ${icon("arrowRight")}</a>`
    : `<span class="tiny-chip">${escapeHtml(fixture.stage === "group" ? `Group ${fixture.group_letter || ""}` : (fixture.stage || "Fixture").toUpperCase())}</span>`;
  return `
    <article class="fixture-card" ${action}>
      <div class="fixture-head">
        <div class="fixture-time">
          <strong>${escapeHtml(formatTime(fixture.kickoff_at))}</strong>
          <span>${escapeHtml(formatDateShort(fixture.kickoff_at))}</span>
        </div>
        <div class="fixture-teams">
          <div class="team-line home">
            <span class="team-name">${escapeHtml(home?.name || fixture.home_nation_code || "TBD")}</span>
            ${home ? flagImg(home.code, home.name) : ""}
          </div>
          <div class="${fixture.finished ? "score-pill" : "vs-pill"}">${fixture.finished ? `${fixture.home_score ?? "-"}-${fixture.away_score ?? "-"}` : "vs"}</div>
          <div class="team-line">
            ${away ? flagImg(away.code, away.name) : ""}
            <span class="team-name">${escapeHtml(away?.name || fixture.away_nation_code || "TBD")}</span>
          </div>
        </div>
        <div>${control}</div>
      </div>
      <div class="fixture-meta">${escapeHtml([fixture.venue, fixture.city, showGroup && fixture.group_letter ? `Group ${fixture.group_letter}` : ""].filter(Boolean).join(" · "))}</div>
    </article>
  `;
}

function flagRingHtml() {
  const radius = window.innerWidth >= 640 ? 215 : window.innerWidth <= 430 ? 140 : 160;
  return RING_CODES.map((code, index) => {
    const angle = (index / RING_CODES.length) * 360;
    return `
      <span class="ring-flag" style="transform: translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(90deg)">
        <img src="${flagUrl(code)}" alt="">
      </span>
    `;
  }).join("");
}

function landingPage() {
  return appShell(`
    <div class="page compact hero">
      <div class="top-strip">
        <span class="brand-chip">WC26</span>
        <span class="status-pill ${state.provider?.active ? "active" : "passive"}">${escapeHtml(state.provider?.active ? "live backend ready" : "reference data ready")}</span>
      </div>

      <section class="hero-ring">
        <div class="hero-glow a"></div>
        <div class="hero-glow b"></div>
        <div class="ring-track">${flagRingHtml()}</div>
        <div class="ring-core">
          <h1 class="title">WC26</h1>
          <p>Canada / Mexico / USA</p>
        </div>
      </section>

      <div class="button-row hero-actions" style="margin-top: 22px">
        <button class="button secondary" data-route="${state.session.user ? "/fantasy" : "/auth"}">Continue to Fantasy XI ${icon("arrowRight")}</button>
        <button class="ghost-button accent" data-route="/standings">Open standings</button>
      </div>

      <div class="feature-grid" style="margin-top: 22px">
        <article class="hero-card lime">
          <div class="card-title"><span class="feature-icon lime">${icon("trophy")}</span> <span class="neon-lime">Fantasy XI</span></div>
          <p class="feature-copy">Build your squad, lock captain and vice-captain, manage the bench and save your team into fantasy leagues.</p>
          <button class="ghost-button" data-route="${state.session.user ? "/fantasy" : "/auth"}">Open squad studio</button>
        </article>
        <article class="hero-card cyan">
          <div class="card-title"><span class="feature-icon cyan">${icon("standings")}</span> <span class="neon-cyan">Results Hub</span></div>
          <p class="feature-copy">Fixtures, full group tables, best third-place rankings, knockout bracket and match detail states in one place.</p>
          <button class="ghost-button accent" data-route="/standings">Open standings</button>
        </article>
      </div>

      <section class="panel" style="margin-top: 28px">
        ${comingUpHtml()}
      </section>

      <section class="panel" style="margin-top: 18px">
        ${landingStandingsPreview()}
      </section>

      <div class="host-row">
        ${HOME_CODES.map((code) => `<span>${flagImg(code, code)} ${escapeHtml(nationMap()[code]?.name?.toUpperCase() || code)}</span>`).join("")}
      </div>
      <div class="footer-date">June 11 - July 19, 2026</div>
    </div>
  `);
}

function landingStandingsPreview() {
  const groups = state.publicData.standings?.groups || {};
  const letter = GROUPS[state.ui.standingsGroup];
  const rows = groups[letter] || [];
  return `
    <div class="heading">
      <div>
        <h2 class="neon-cyan">Live Group Standings</h2>
        <p class="eyebrow">Groups A - L</p>
      </div>
    </div>
    <div class="meta-row" style="justify-content: space-between; align-items: center; margin-top: 10px">
      <button class="icon-button cyan" data-action="cycle-group" data-direction="-1">${icon("chevronLeft")}</button>
      <div class="metric-pill">Group ${letter}</div>
      <button class="icon-button magenta" data-action="cycle-group" data-direction="1">${icon("chevronRight")}</button>
    </div>
    <div class="surface table-shell" style="margin-top: 12px">
      <table>
        <thead>
          <tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row, index) => `
            <tr class="${index < 2 ? "qualify" : index === 2 ? "third" : ""}">
              <td>${index + 1}</td>
              <td><div class="table-team">${flagImg(row.nation.code, row.nation.name)}<span>${escapeHtml(row.nation.name)}</span></div></td>
              <td>${row.played}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td><td class="table-points">${row.pts}</td>
            </tr>`).join("")
          : `<tr><td colspan="8"><div class="empty-state">Tables will fill in as matches are completed.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="group-dots">${GROUPS.map((group, index) => `<button class="group-dot ${index === state.ui.standingsGroup ? "active" : ""}" data-action="pick-group" data-group="${index}" aria-label="Group ${group}"></button>`).join("")}</div>
    <p class="small-meta" style="margin-top: 12px; text-align: center">Top 2 in each group plus the 8 best third-place teams advance to the Round of 32.</p>
  `;
}

function appShell(content) {
  return `
    <div class="app-shell">
      <div class="ambient"></div>
      ${content}
      ${bottomNav()}
    </div>
  `;
}

function bottomNav() {
  if (!state.session.user || ["/auth", "/privacy", "/terms", "/support", "/admin"].includes(state.route)) return "";
  const items = [
    { route: "/standings", label: "Standings", icon: "standings" },
    { route: "/fantasy", label: "Fantasy", icon: "fantasy" },
    { route: "/leaderboard", label: "Leagues", icon: "leagues" },
    { route: "/profile", label: "Profile", icon: "profile" },
  ];
  return `
    <div class="bottom-nav-wrap">
      <div class="nav-shell">
        <div class="nav-list">
          ${items.map((item) => `
            <a class="nav-link ${state.route === item.route ? "active" : ""} ${item.alert && state.route !== item.route ? "has-alert" : ""}" href="${item.route}" data-route="${item.route}">
              ${icon(item.icon)}
              <span>${escapeHtml(item.label)}</span>
            </a>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function pageHeader(title, subtitle, accent = "magenta") {
  return `
    <div class="heading">
      <div>
        <h1 class="${accent === "cyan" ? "neon-cyan" : accent === "lime" ? "neon-lime" : "neon-magenta"}">${escapeHtml(title)}</h1>
        <p class="subcopy">${escapeHtml(subtitle)}</p>
      </div>
    </div>
    <div class="surface" style="height:1px; padding:0; margin-top:12px; background:rgba(255,255,255,0.08)"></div>
  `;
}

function standingsPage() {
  const payload = state.publicData.standings;
  if (!payload) return loadingPanel();
  const tab = state.ui.standingsTab;
  return appShell(`
    <div class="page">
      ${pageHeader("Results & Standings", "Fixtures, groups, best third-place teams, bracket and player stat states.", "magenta")}
      <div class="tab-row" style="margin-top:16px">
        ${tabButton("standings-tab", "fixtures", "Fixtures", "magenta", tab)}
        ${tabButton("standings-tab", "groups", "Groups", "cyan", tab)}
        ${tabButton("standings-tab", "thirds", "3rd", "gold", tab)}
        ${tabButton("standings-tab", "bracket", "Bracket", "lime", tab)}
        ${tabButton("standings-tab", "stats", "Stats", "gold", tab)}
      </div>
      <div style="margin-top:16px">
        ${tab === "fixtures" ? standingsFixturesView(payload) : ""}
        ${tab === "groups" ? standingsGroupsView(payload) : ""}
        ${tab === "thirds" ? standingsThirdsView(payload) : ""}
        ${tab === "bracket" ? standingsBracketView(payload) : ""}
        ${tab === "stats" ? standingsStatsView(payload) : ""}
      </div>
    </div>
  `);
}

function tabButton(action, value, label, color, active) {
  return `<button class="tab-button ${active === value ? `active ${color}` : ""}" data-action="${action}" data-value="${value}">${escapeHtml(label)}</button>`;
}

function standingsFixturesView(payload) {
  const nations = state.publicData.nations;
  const fixtures = payload.fixtures.filter((fixture) => fixture.stage === "group");
  const byGroup = Object.fromEntries(GROUPS.map((group) => [group, fixtures.filter((fixture) => fixture.group_letter === group)]));
  const groupedByDate = Object.entries(
    fixtures.reduce((acc, fixture) => {
      const key = String(fixture.kickoff_at).slice(0, 10);
      acc[key] = acc[key] || [];
      acc[key].push(fixture);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));
  const filtered = (fixture) => {
    if (state.ui.fixturesNation !== "all" && ![fixture.home_nation_code, fixture.away_nation_code].includes(state.ui.fixturesNation)) return false;
    if (state.ui.fixturesGroup !== "all" && fixture.group_letter !== state.ui.fixturesGroup) return false;
    return true;
  };
  return `
    <div class="stack">
      <div class="surface">
        <div class="league-toolbar">
          <div class="tile-toggle">
            <button class="${state.ui.fixturesMode === "group" ? "active" : ""}" data-action="fixtures-mode" data-value="group">By Group</button>
            <button class="${state.ui.fixturesMode === "date" ? "active" : ""}" data-action="fixtures-mode" data-value="date">By Date</button>
          </div>
          <div class="chip-row">
            <select class="field-select" data-action="fixtures-nation">
              <option value="all">All nations</option>
              ${nations.map((nation) => `<option value="${nation.code}" ${state.ui.fixturesNation === nation.code ? "selected" : ""}>${escapeHtml(nation.name)}</option>`).join("")}
            </select>
            <select class="field-select" data-action="fixtures-group">
              <option value="all">All groups</option>
              ${GROUPS.map((group) => `<option value="${group}" ${state.ui.fixturesGroup === group ? "selected" : ""}>Group ${group}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      ${
        state.ui.fixturesMode === "group"
          ? GROUPS.map((group) => {
              if (state.ui.fixturesGroup !== "all" && state.ui.fixturesGroup !== group) return "";
              const rows = (byGroup[group] || []).filter(filtered);
              if (!rows.length) return "";
              return `<section class="surface"><div class="heading"><h2 class="neon-cyan">Group ${group}</h2></div><div class="fixture-list" style="margin-top:12px">${rows.map((fixture) => fixtureCard(fixture, true)).join("")}</div></section>`;
            }).join("")
          : groupedByDate.map(([dateKey, rows]) => {
              const visible = rows.filter(filtered);
              if (!visible.length) return "";
              return `<section class="surface"><div class="eyebrow">${escapeHtml(formatDate(`${dateKey}T00:00:00Z`, { weekday: "short", day: "numeric", month: "short" }).toUpperCase())}</div><div class="fixture-list" style="margin-top:12px">${visible.map((fixture) => fixtureCard(fixture, true, true)).join("")}</div></section>`;
            }).join("")
      }
    </div>
  `;
}

function standingsGroupsView(payload) {
  return `
    <div class="stack">
      <p class="small-meta" style="text-align:center">The top 2 from each group, plus the 8 best third-placed teams, advance to the Round of 32.</p>
      <div class="standings-grid">
        ${GROUPS.map((group) => groupTableCard(group, payload.groups[group] || [])).join("")}
      </div>
    </div>
  `;
}

function groupTableCard(group, rows) {
  return `
    <section class="surface table-shell">
      <div class="heading"><h2 class="neon-cyan">Group ${group}</h2></div>
      <table style="margin-top:12px">
        <thead>
          <tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr class="${index < 2 ? "qualify" : index === 2 ? "third" : ""}">
              <td>${index + 1}</td>
              <td><div class="table-team">${flagImg(row.nation.code, row.nation.name)}<span>${escapeHtml(row.nation.name)}</span>${index < 3 ? `<span class="q-pill">${index < 2 ? "Q" : "3"}</span>` : ""}</div></td>
              <td>${row.played}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td><td class="table-points">${row.pts}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function standingsThirdsView(payload) {
  return `
    <section class="surface table-shell">
      <div class="heading">
        <div>
          <h2 class="neon-lime">Best 3rd-placed teams</h2>
          <p class="eyebrow">Top 8 qualify</p>
        </div>
      </div>
      <table class="thirds-table" style="margin-top:12px">
        <thead>
          <tr><th>#</th><th>Team</th><th>Grp</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${payload.thirds.length ? payload.thirds.map((row) => `
            <tr class="${row.qualified ? "qualify" : ""}">
              <td>${row.rank}</td>
              <td><div class="table-team">${flagImg(row.nation.code, row.nation.name)}<span>${escapeHtml(row.nation.name)}</span>${row.qualified ? '<span class="q-pill">Q</span>' : ""}</div></td>
              <td>${row.group}</td><td>${row.played}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td><td class="table-points">${row.pts}</td>
            </tr>
          `).join("") : `<tr><td colspan="11"><div class="empty-state">No third-placed teams yet - the group stage has not completed.</div></td></tr>`}
        </tbody>
      </table>
    </section>
  `;
}

function standingsBracketView(payload) {
  const stageLabels = [
    { key: "r32", label: "Round of 32" },
    { key: "r16", label: "Round of 16" },
    { key: "qf", label: "Quarter-finals" },
    { key: "sf", label: "Semi-finals" },
    { key: "third", label: "3rd-place play-off" },
    { key: "final", label: "Final" },
  ];
  return `
    <div class="stack">
      <div class="surface">
        <div class="bracket-stage-list">
          ${stageLabels.map((stage) => `
            <section class="bracket-column">
              <div class="bracket-title">${escapeHtml(stage.label)}</div>
              ${(payload.bracket[stage.key] || []).map((fixture) => bracketCard(fixture)).join("")}
            </section>
          `).join("")}
        </div>
      </div>
      <p class="small-meta" style="text-align:center">Knockout slots fill automatically from group standings and reference fixture data as nations are confirmed.</p>
    </div>
  `;
}

function bracketCard(fixture) {
  const home = fixture.home_nation || nationMap()[fixture.home_nation_code];
  const away = fixture.away_nation || nationMap()[fixture.away_nation_code];
  return `
    <article class="bracket-card ${fixture.finished ? "" : ""}" data-action="${fixture.finished ? "open-fixture" : ""}" data-fixture="${escapeHtml(fixture.id || "")}">
      <div class="bracket-body">
        <div class="bracket-label">${escapeHtml(fixture.bracket_slot || fixture.stage || "KO")}</div>
        <div class="small-meta">${escapeHtml(`${formatDateShort(fixture.kickoff_at)} · ${formatTime(fixture.kickoff_at)}`)}</div>
        <div class="bracket-team">${home ? flagImg(home.code, home.name) : '<span class="flag"></span>'}<span class="team-name">${escapeHtml(home?.name || home?.code || "TBD")}</span><strong class="table-points">${fixture.home_score ?? ""}</strong></div>
        <div class="bracket-team">${away ? flagImg(away.code, away.name) : '<span class="flag"></span>'}<span class="team-name">${escapeHtml(away?.name || away?.code || "TBD")}</span><strong class="table-points">${fixture.away_score ?? ""}</strong></div>
      </div>
    </article>
  `;
}

function standingsStatsView(payload) {
  const cards = [
    ["goals", "Golden Boot", "goals", "gold"],
    ["clean_sheets", "Golden Glove", "CS", "cyan"],
    ["yellow_cards", "Most Yellow Cards", "YC", "gold"],
    ["red_cards", "Most Red Cards", "RC", "magenta"],
    ["minutes", "Most Minutes", "min", "magenta"],
    ["fantasy_points", "Most Fantasy Points", "pts", "lime"],
  ];
  return `
    <div class="stats-grid">
      ${cards.map(([key, title, unit, color]) => statLeaderCard(key, title, unit, color, payload.playerStats[key] || [])).join("")}
    </div>
  `;
}

function statLeaderCard(key, title, unit, color, rows) {
  const colorClass = color === "gold" ? "neon-lime" : color === "cyan" ? "neon-cyan" : color === "lime" ? "neon-lime" : "neon-magenta";
  return `
    <section class="stat-card">
      <div class="heading"><h2 class="${colorClass}">${escapeHtml(title)}</h2></div>
      <div class="stat-list" style="margin-top:12px">
        ${rows.length ? rows.slice(0, 8).map((row, index) => `
          <div class="stat-row">
            <span>${index + 1}</span>
            ${flagImg(row.nation_code, row.nation_code)}
            <div class="player-main"><strong>${escapeHtml(row.player_name)}</strong><div class="player-sub">${escapeHtml(`${row.nation_code} · ${row.position}`)}</div></div>
            <strong class="table-points">${row.total} <span class="player-sub">${escapeHtml(unit)}</span></strong>
          </div>
        `).join("") : `<div class="empty-state">No stat leaders are recorded yet.</div>`}
      </div>
    </section>
  `;
}

function leaderboardPage() {
  const board = state.session.leaderboard || { global: [], position: null, leagues: [] };
  const scope = state.ui.activeLeagueId;
  const activeLeague = board.leagues.find((league) => league.id === scope);
  const rows = scope === "global" ? board.global : (activeLeague?.members || []);
  const scopePosition = scope === "global" ? board.position : activeLeague?.position;
  return appShell(`
    <div class="page">
      ${pageHeader("Leagues", scope === "global" ? "Global standings plus private fantasy leagues." : "Daily league points for the current matchday window.", "magenta")}
      <div class="stack" style="margin-top:16px">
        <div class="surface">
          <div class="league-toolbar">
            <div class="chip-row">
              <button class="chip-button ${scope === "global" ? "active" : ""}" data-action="league-scope" data-value="global">Global</button>
              ${board.leagues.map((league) => `<button class="chip-button ${scope === league.id ? "active" : ""}" data-action="league-scope" data-value="${league.id}">${escapeHtml(league.name)}</button>`).join("")}
            </div>
            <div class="chip-row">
              <button class="ghost-button accent" data-action="open-create-league">${icon("plus")} League</button>
            </div>
          </div>
        </div>
        ${
          scopePosition
            ? `<section class="leaderboard-card surface">
                <div class="leaderboard-row">
                  <div class="rank-badge ${scopePosition.rank === 1 ? "gold" : scopePosition.rank === 2 ? "silver" : scopePosition.rank === 3 ? "bronze" : ""}">${scopePosition.rank || "—"}</div>
                  ${state.session.profile?.supported_nation_code ? flagImg(state.session.profile.supported_nation_code, state.session.profile.supported_nation_code) : '<span class="flag"></span>'}
                  <div class="player-main"><strong>${escapeHtml(state.session.profile?.display_name || "You")}</strong><div class="player-sub">of ${scopePosition.total} players</div></div>
                  <div class="points-pill">${scopePosition.points || 0}</div>
                </div>
              </section>`
            : ""
        }
        ${
          activeLeague
            ? `<section class="surface">
                <div class="league-header">
                  <div>
                    <div class="league-name">${escapeHtml(activeLeague.name)}</div>
                    <div class="small-meta">Invite code</div>
                    <div class="invite-code">${escapeHtml(activeLeague.invite_code)}</div>
                    <div class="small-meta" style="margin-top:8px">Daily scoring: 3 for first, 1 for second, 0 for the rest. Window: IST day.</div>
                  </div>
                  <div class="chip-row">
                    <button class="ghost-button gold" data-action="copy-code" data-code="${activeLeague.invite_code}">${icon("copy")} Copy</button>
                    ${
                      activeLeague.owner_id === state.session.user?.id
                        ? `<button class="ghost-button" data-action="delete-league" data-league="${activeLeague.id}">Delete</button>`
                        : `<button class="ghost-button" data-action="leave-league" data-league="${activeLeague.id}">Leave</button>`
                    }
                  </div>
                </div>
              </section>`
            : ""
        }
        <section class="leaderboard-card surface">
          ${rows.length ? rows.map((row, index) => leaderboardRow(row, index)).join("") : `<div class="empty-state">No scores yet.</div>`}
        </section>
      </div>
    </div>
  `);
}

function leaderboardRow(row, index) {
  const profile = row;
  const rankClass = index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : "";
  const points = profile.league_points ?? profile.fantasy_points ?? 0;
  return `
    <div class="leaderboard-row">
      <div class="rank-badge ${rankClass}">${index + 1}</div>
      ${profile.supported_nation_code ? flagImg(profile.supported_nation_code, profile.supported_nation_code) : '<span class="flag"></span>'}
      <div class="player-main"><strong>${escapeHtml(profile.display_name || "Player")}</strong><div class="player-sub">${escapeHtml(profile.league_team_name || profile.email || "")}</div></div>
      <div class="points-pill">${points}</div>
    </div>
  `;
}

function fantasyPage() {
  syncDraftOrdering();
  const draft = state.fantasyDraft;
  const starters = starterIdsFromDraft().map((id) => playerMap()[id]).filter(Boolean);
  const starterGroups = {
    GK: starters.filter((player) => player.position === "GK"),
    DEF: starters.filter((player) => player.position === "DEF"),
    MID: starters.filter((player) => player.position === "MID"),
    FWD: starters.filter((player) => player.position === "FWD"),
  };
  const cursors = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const bench = benchIdsFromDraft().map((id) => playerMap()[id]).filter(Boolean);
  const squadCount = draft.player_ids.length;
  return appShell(`
    <div class="page">
      ${pageHeader("Fantasy XI", "Build the full 15-player squad, set your roles and save into leagues.", "magenta")}
      <div class="stack" style="margin-top:16px">
        <div class="budget-board">
          <div class="metric-card"><span class="metric-label">Budget left</span><strong class="metric-value neon-cyan">${money(BUDGET_CAP - spentBudget())}</strong></div>
          <div class="metric-card"><span class="metric-label">Squad</span><strong class="metric-value neon-lime">${squadCount}/15</strong></div>
          <div class="metric-card"><span class="metric-label">Manager</span><strong class="metric-value neon-magenta">${fantasyManager() ? money(fantasyManager().price) : "--"}</strong></div>
          <div class="metric-card"><span class="metric-label">Points</span><strong class="metric-value neon-cyan">${squadProjectedPoints()}</strong></div>
        </div>

        <div class="fantasy-grid">
          <section class="surface pitch-wrap">
            <div class="field">
              <label for="teamName">Team name</label>
              <input class="field-input" id="teamName" data-action="team-name" value="${escapeHtml(draft.team_name)}" placeholder="Name your squad">
            </div>
            <div class="pitch" style="margin-top:14px">
              <div class="half-line"></div>
              <div class="center-circle"></div>
              ${FORMATION.map((slot) => {
                const player = starterGroups[slot.position][cursors[slot.position]++];
                if (!player) {
                  return `<div class="pitch-slot" style="left:${slot.x}%; top:${slot.y}%"><button class="pitch-player empty">${slot.position}</button></div>`;
                }
                const role = draft.captain_id === player.id ? "C" : draft.vice_captain_id === player.id ? "VC" : player.position;
                return `
                  <div class="pitch-slot" style="left:${slot.x}%; top:${slot.y}%">
                    <button class="pitch-player" data-action="focus-player" data-player="${player.id}">
                      <strong>${escapeHtml(player.nation.code)}</strong>
                      <span>${escapeHtml(role)}</span>
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
            <div class="bench-row">
              ${bench.map((player) => `
                <div class="bench-card">
                  <div class="small-meta">Bench</div>
                  <strong>${escapeHtml(player.name)}</strong>
                  <div class="player-sub">${escapeHtml(`${player.position} · ${player.nation.code}`)}</div>
                </div>
              `).join("")}
            </div>
            <div class="manager-card" style="margin-top:12px">
              <div>${fantasyManager()?.nation ? flagImg(fantasyManager().nation.code, fantasyManager().nation.name) : ""}</div>
              <div>
                <div class="small-meta">Manager</div>
                <strong>${escapeHtml(fantasyManager()?.name || "Select a manager")}</strong>
                <div class="player-sub">${escapeHtml(fantasyManager()?.nation?.name || "")}</div>
              </div>
              <select class="field-select" data-action="manager-select">
                <option value="">Manager</option>
                ${state.publicData.managers.map((manager) => `<option value="${manager.id}" ${draft.manager_id === manager.id ? "selected" : ""}>${escapeHtml(`${manager.name} · ${manager.nation?.code || ""} · ${money(manager.price)}`)}</option>`).join("")}
              </select>
            </div>
          </section>

          <section class="surface">
            <div class="heading">
              <div>
                <h2 class="neon-cyan">Player Pool</h2>
                <p class="subcopy">Use the same core filters and role controls from the reference build.</p>
              </div>
              <div class="tile-toggle">
                ${["PRICE", "PTS", "NEXT"].map((mode) => `<button class="${state.ui.fantasyTile === mode ? "active" : ""}" data-action="fantasy-tile" data-value="${mode}">${mode}</button>`).join("")}
              </div>
            </div>

            <div class="player-filter-row" style="margin-top:12px">
              ${["ALL", "GK", "DEF", "MID", "FWD"].map((filter) => `<button class="chip-button ${state.ui.fantasyFilter === filter ? "active" : ""}" data-action="fantasy-filter" data-value="${filter}">${filter}</button>`).join("")}
            </div>

            <label class="field" style="margin-top:12px">
              <span class="hidden">Search</span>
              <div style="position:relative">
                <input class="field-input" data-action="fantasy-search" value="${escapeHtml(state.ui.fantasySearch)}" placeholder="Search by name, nation or club">
              </div>
            </label>

            <div class="player-list" style="margin-top:12px">${fantasyPlayerRows()}</div>

            <div class="stack" style="margin-top:14px">
              <div class="surface">
                <div class="heading"><h2 class="neon-lime">Roles</h2></div>
                <div class="table-list" style="margin-top:12px">${starterIdsFromDraft().map((id) => roleRow(playerMap()[id])).join("")}</div>
              </div>
              <button class="button tertiary" data-action="save-team">Save Fantasy XI</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `);
}

function fantasyPlayerRows() {
  const term = state.ui.fantasySearch.trim().toLowerCase();
  return state.publicData.players
    .filter((player) => state.ui.fantasyFilter === "ALL" || player.position === state.ui.fantasyFilter)
    .filter((player) => {
      if (!term) return true;
      return [player.name, player.nation.name, player.nation.code, player.club, player.position].some((value) => String(value || "").toLowerCase().includes(term));
    })
    .slice(0, 80)
    .map((player) => {
      const selected = state.fantasyDraft.player_ids.includes(player.id);
      const disabled = !selected && !canAddPlayer(player);
      return `
        <button class="player-row ${selected ? "selected" : ""}" data-action="toggle-player" data-player="${player.id}" ${disabled ? "disabled" : ""}>
          <span class="position-pill">${escapeHtml(player.position)}</span>
          <div class="player-main">
            <strong>${escapeHtml(player.name)}</strong>
            <div class="player-sub">${escapeHtml(`${player.nation.name} · ${player.club || "National team"}`)}</div>
          </div>
          <div class="player-actions">
            <strong>${escapeHtml(tileValue(player))}</strong>
            <span class="player-sub">${selected ? "Selected" : player.injured || player.suspended ? "Watchlist" : ""}</span>
          </div>
        </button>
      `;
    }).join("") || `<div class="empty-state">No players match this filter.</div>`;
}

function tileValue(player) {
  if (state.ui.fantasyTile === "PTS") return `${Math.round(playerProjection(player))} pts`;
  if (state.ui.fantasyTile === "NEXT") return `Grp ${player.nation.group_letter || "-"}`;
  return money(player.price);
}

function roleRow(player) {
  if (!player) return "";
  const isCaptain = state.fantasyDraft.captain_id === player.id;
  const isVice = state.fantasyDraft.vice_captain_id === player.id;
  const isStarter = starterIdsFromDraft().includes(player.id);
  return `
    <div class="player-row selected">
      <span class="position-pill">${escapeHtml(player.position)}</span>
      <div class="player-main">
        <strong>${escapeHtml(player.name)}</strong>
        <div class="player-sub">${escapeHtml(`${player.nation.code} · ${money(player.price)}`)}</div>
      </div>
      <div class="role-row">
        <button class="role-chip ${isCaptain ? "active" : ""}" data-action="set-captain" data-player="${player.id}">C</button>
        <button class="role-chip ${isVice ? "active" : ""}" data-action="set-vice" data-player="${player.id}">VC</button>
        <button class="role-chip ${isStarter ? "active" : ""}" data-action="toggle-starter" data-player="${player.id}">${isStarter ? "XI" : "Bench"}</button>
      </div>
    </div>
  `;
}

function canAddPlayer(player) {
  const ids = state.fantasyDraft.player_ids;
  if (ids.includes(player.id)) return true;
  if (ids.length >= 15) return false;
  const counts = positionCounts(ids);
  if (counts[player.position] >= SQUAD_LIMITS[player.position]) return false;
  return spentBudget() + Number(player.price || 0) <= BUDGET_CAP;
}

function togglePlayer(playerId) {
  const ids = [...state.fantasyDraft.player_ids];
  if (ids.includes(playerId)) {
    state.fantasyDraft.player_ids = ids.filter((id) => id !== playerId);
    state.fantasyDraft.starters = state.fantasyDraft.starters.filter((id) => id !== playerId);
    state.fantasyDraft.bench = state.fantasyDraft.bench.filter((id) => id !== playerId);
    if (state.fantasyDraft.captain_id === playerId) state.fantasyDraft.captain_id = "";
    if (state.fantasyDraft.vice_captain_id === playerId) state.fantasyDraft.vice_captain_id = "";
  } else {
    const player = playerMap()[playerId];
    if (!player || !canAddPlayer(player)) return;
    ids.push(playerId);
    state.fantasyDraft.player_ids = ids;
  }
  syncDraftOrdering();
  render();
}

function toggleStarter(playerId) {
  const starters = new Set(starterIdsFromDraft());
  const player = playerMap()[playerId];
  if (!player) return;
  if (starters.has(playerId)) {
    if (starters.size <= 11) {
      const benchCandidate = benchIdsFromDraft().find((id) => playerMap()[id]?.position === player.position) || benchIdsFromDraft()[0];
      if (!benchCandidate) return;
      starters.delete(playerId);
      starters.add(benchCandidate);
    }
  } else {
    const currentStarterIds = [...starters];
    const samePos = currentStarterIds.find((id) => playerMap()[id]?.position === player.position);
    if (samePos) starters.delete(samePos);
    else starters.delete(currentStarterIds[currentStarterIds.length - 1]);
    starters.add(playerId);
  }
  state.fantasyDraft.starters = [...starters];
  state.fantasyDraft.bench = state.fantasyDraft.player_ids.filter((id) => !starters.has(id));
  syncDraftOrdering();
  render();
}

function profilePage() {
  const profile = state.session.profile;
  const leagueCount = state.session.leaderboard?.leagues?.length || 0;
  return appShell(`
    <div class="page">
      ${pageHeader("Profile", "Account, leaderboard identity and support tools.", "magenta")}
      <div class="stack" style="margin-top:16px">
        <section class="surface">
          <div class="profile-hero">
            <div class="avatar">${escapeHtml(initials(profile.display_name))}</div>
            <div>
              <h2 class="neon-magenta">${escapeHtml(profile.display_name)}</h2>
              <p class="subcopy">${escapeHtml(state.session.user?.email || "")}</p>
            </div>
          </div>
          <div class="grid-2" style="margin-top:14px">
            <div class="profile-stat"><span class="metric-label">Team points</span><strong class="neon-lime">${profile.fantasy_points || 0}</strong></div>
            <div class="profile-stat"><span class="metric-label">Leagues</span><strong class="neon-cyan">${leagueCount}</strong></div>
          </div>
        </section>

        <section class="settings-grid">
          <form class="surface stack" data-action="save-profile-name">
            <div class="heading"><h2 class="neon-cyan">Display name</h2></div>
            <p class="subcopy">Shown on leaderboards. Use 2-24 characters.</p>
            <input class="field-input" name="display_name" value="${escapeHtml(profile.display_name)}" maxlength="24">
            <button class="button secondary" type="submit">Save name</button>
          </form>

          <form class="surface stack" data-action="save-profile-prefs">
            <div class="heading"><h2 class="neon-cyan">Preferences</h2></div>
            <div class="field">
              <label>Supported nation</label>
              <select class="field-select" name="supported_nation_code">
                <option value="">None / hide flag</option>
                ${state.publicData.nations.map((nation) => `<option value="${nation.code}" ${profile.supported_nation_code === nation.code ? "selected" : ""}>${escapeHtml(nation.name)}</option>`).join("")}
              </select>
            </div>
            <button class="button secondary" type="submit">Save preferences</button>
          </form>
        </section>

        <a class="surface" href="/help" data-route="/help">
          <div class="heading"><h2 class="neon-cyan">${icon("support")} Contact support</h2></div>
          <p class="subcopy" style="margin-top:8px">Send a bug report or question. Your support requests stay attached to this account.</p>
        </a>

        <div class="chip-row">
          <button class="ghost-button" data-action="sign-out">${icon("logout")} Sign out</button>
          <button class="ghost-button" data-action="delete-local-account">Delete local data</button>
          <a class="ghost-button" href="/privacy" data-route="/privacy">Privacy</a>
          <a class="ghost-button" href="/terms" data-route="/terms">Terms</a>
          <a class="ghost-button" href="/support" data-route="/support">FAQs</a>
        </div>
      </div>
    </div>
  `);
}

function helpPage() {
  return appShell(`
    <div class="page">
      ${pageHeader("Contact Support", "Report bugs, squad issues or general questions.", "magenta")}
      <div class="stack" style="margin-top:16px">
        <form class="surface stack" data-action="send-support">
          <div class="field">
            <label>Subject</label>
            <input class="field-input" name="subject" placeholder="What do you need help with?">
          </div>
          <div class="field">
            <label>Details</label>
            <textarea class="textarea" name="message" placeholder="Describe the issue, the route you were on and what you expected to happen."></textarea>
          </div>
          <button class="button primary" type="submit">Send request</button>
        </form>
        <section class="surface">
          <div class="heading"><h2 class="neon-cyan">Recent support requests</h2></div>
          <div class="message-list" style="margin-top:12px">${supportHistoryHtml()}</div>
        </section>
      </div>
    </div>
  `);
}

function supportHistoryHtml() {
  const rows = state.session.supportMessages || [];
  return rows.length
    ? rows.map((entry) => `
        <article class="message-card">
          <div class="message-title">${escapeHtml(entry.subject)}</div>
          <div class="small-meta" style="margin-bottom:8px">${escapeHtml(formatDate(entry.created_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</div>
          <p>${withBreaks(entry.message)}</p>
        </article>`).join("")
    : `<div class="empty-state">No support requests sent from this account yet.</div>`;
}

function staticPage(title, body, accent = "magenta") {
  return `
    <div class="page compact">
      ${pageHeader(title, "", accent)}
      <section class="surface stack" style="margin-top:16px">${body}</section>
    </div>
  `;
}

function supportFaqPage() {
  return appShell(staticPage("Support", `
    <div class="faq-list">
      ${state.publicData.faqs.map((faq) => `<article class="faq-card"><strong>${escapeHtml(faq.question)}</strong><p class="subcopy" style="margin-top:8px">${escapeHtml(faq.answer)}</p></article>`).join("")}
    </div>
  `, "cyan"));
}

function adminPage() {
  return appShell(`
    <div class="page">
      ${state.admin.user ? adminDashboardPage() : adminLoginPage()}
    </div>
  `);
}

function adminLoginPage() {
  const form = state.ui.authForms.admin;
  return `
    <section class="admin-hero surface">
      <div>
        <span class="brand-chip">ADMIN</span>
        <h1 class="neon-cyan">Control Room</h1>
        <p class="subcopy">Separate staff access for quota, sync logs, support and scoring oversight.</p>
      </div>
      <form class="admin-login stack" data-action="admin-login">
        <div class="field"><label>Email</label><input class="field-input" name="email" type="email" autocomplete="username" value="${escapeHtml(form.email)}" required></div>
        <div class="field"><label>Password</label><input class="field-input" name="password" type="password" autocomplete="current-password" value="${escapeHtml(form.password)}" required></div>
        <button class="button primary" type="submit">Open admin</button>
      </form>
    </section>
  `;
}

function adminDashboardPage() {
  const dashboard = state.admin.dashboard;
  if (!dashboard) return loadingPanel();
  const usage = dashboard.usage || {};
  const provider = dashboard.provider || {};
  const counts = dashboard.counts || {};
  const editor = dashboard.editor || {};
  const sources = editor.sources || {};
  return `
    <div class="stack">
      <section class="admin-hero surface">
        <div>
          <span class="brand-chip">ADMIN</span>
          <h1 class="neon-cyan">Control Room</h1>
          <p class="subcopy">${escapeHtml(state.admin.user?.email || "")}</p>
        </div>
        <div class="button-row">
          <button class="ghost-button accent" data-action="admin-refresh-provider">${icon("refresh")} Refresh API status</button>
          <button class="ghost-button gold" data-action="admin-recompute-scoring">${icon("refresh")} Recompute scoring</button>
          <button class="ghost-button" data-action="admin-reset-quota">Reset local quota</button>
          <button class="ghost-button" data-action="admin-sign-out">${icon("logout")} Sign out</button>
        </div>
      </section>

      <section class="budget-board">
        <div class="metric-card"><span class="metric-label">Users</span><strong class="metric-value neon-cyan">${counts.users ?? 0}</strong></div>
        <div class="metric-card"><span class="metric-label">Teams</span><strong class="metric-value neon-lime">${counts.teams ?? 0}</strong></div>
        <div class="metric-card"><span class="metric-label">Leagues</span><strong class="metric-value neon-magenta">${counts.leagues ?? 0}</strong></div>
        <div class="metric-card"><span class="metric-label">Support</span><strong class="metric-value neon-cyan">${counts.support ?? 0}</strong></div>
      </section>

      <section class="surface">
        <div class="heading">
          <div>
            <h2 class="neon-magenta">API-Football</h2>
            <p class="subcopy">${escapeHtml(provider.message || "Cached data is active.")}</p>
          </div>
          <span class="status-pill ${provider.active ? "active" : "passive"}">${escapeHtml(provider.plan || "Provider")}</span>
        </div>
        <div class="provider-grid" style="margin-top:12px">
          <div class="metric-card"><span class="metric-label">Daily left</span><strong class="metric-value neon-cyan">${usage.daily_remaining ?? "--"}</strong></div>
          <div class="metric-card"><span class="metric-label">Minute left</span><strong class="metric-value neon-magenta">${usage.minute_remaining ?? "--"}</strong></div>
          <div class="metric-card"><span class="metric-label">Reserve</span><strong class="metric-value neon-lime">${usage.reserve_limit ?? 30}</strong></div>
          <div class="metric-card"><span class="metric-label">Reset</span><strong class="metric-value neon-cyan">UTC ${usage.reset_time_utc || "00:00"}</strong></div>
        </div>
      </section>

      <section class="grid-2">
        <div class="surface">
          <div class="heading"><h2 class="neon-cyan">Sync Logs</h2></div>
          <div class="admin-list" style="margin-top:12px">${adminSyncRows(dashboard.recentSyncs || [])}</div>
        </div>
        <div class="surface">
          <div class="heading"><h2 class="neon-cyan">Support Queue</h2></div>
          <div class="admin-list" style="margin-top:12px">${adminSupportRows(dashboard.support || [])}</div>
        </div>
      </section>

      <section class="grid-2">
        <div class="surface">
          <div class="heading"><h2 class="neon-cyan">Raw Responses</h2></div>
          <div class="admin-list" style="margin-top:12px">${adminRawRows(dashboard.recentResponses || [])}</div>
        </div>
        <div class="surface">
          <div class="heading"><h2 class="neon-cyan">Daily League Awards</h2></div>
          <div class="admin-list" style="margin-top:12px">${adminDailyAwardRows(dashboard.leagueDailyPoints || {})}</div>
        </div>
      </section>

      <section class="surface stack">
        <div class="heading">
          <div>
            <h2 class="neon-magenta">Data Studio</h2>
            <p class="subcopy">Import reference data, switch to local editable copies, and save direct JSON changes that the live app uses immediately.</p>
          </div>
        </div>
        <div class="grid-3">
          ${adminImportCard("Fixtures", "fixtures", sources.fixtures, "Use `/fixtures` shaped rows here.")}
          ${adminImportCard("Players", "players", sources.players, "Use `/players` or squad rows mapped into player objects.")}
          ${adminImportCard("Match Stats", "matchPlayerStats", sources.matchPlayerStats, "Set `fantasy_points_override` on a stat row to hard-set a player's points.")}
        </div>
        <div class="grid-2">
          ${adminEditorForm("Fixtures", "fixtures", editor.fixtures || [], sources.fixtures, "Full fixture collection used by standings and matchdays.")}
          ${adminEditorForm("Players", "players", editor.players || [], sources.players, "Prices, positions, flags, injuries, and base point totals.")}
          ${adminEditorForm("Managers", "managers", editor.managers || [], sources.managers, "Fantasy manager prices and nation mappings.")}
          ${adminEditorForm("Goal Events", "goalEvents", editor.goalEvents || [], sources.goalEvents, "Finished-match event feed used in fixture detail views.")}
          ${adminEditorForm("Match Player Stats", "matchPlayerStats", editor.matchPlayerStats || [], sources.matchPlayerStats, "Per-match stat rows. Add `fantasy_points_override` to force a player's score.")}
          ${adminEditorForm("Scoring Rules", "scoringRules", editor.scoringRules || {}, sources.scoringRules, "Change fantasy point rules and league day-award values.")}
        </div>
      </section>
    </div>
  `;
}

function adminImportCard(title, kind, source, note) {
  return `
    <article class="admin-row">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(`Source: ${source || "reference"}`)}</span>
      <p>${escapeHtml(note)}</p>
      <div class="button-row">
        <button class="ghost-button accent" data-action="admin-import-editor" data-kind="${kind}">Import reference</button>
        <button class="ghost-button" data-action="admin-reset-editor" data-kind="${kind}">Use reference feed</button>
      </div>
    </article>
  `;
}

function adminEditorForm(title, kind, payload, source, hint) {
  return `
    <form class="surface stack" data-action="admin-save-editor">
      <input type="hidden" name="kind" value="${kind}">
      <div class="heading">
        <div>
          <h2 class="neon-cyan">${escapeHtml(title)}</h2>
          <p class="subcopy">${escapeHtml(hint)}</p>
        </div>
        <span class="tiny-chip">${escapeHtml(source || "reference")}</span>
      </div>
      <textarea class="textarea admin-json" name="payload" spellcheck="false">${escapeHtml(prettyJson(payload))}</textarea>
      <div class="button-row">
        <button class="ghost-button accent" type="button" data-action="admin-import-editor" data-kind="${kind}">Import reference</button>
        <button class="ghost-button" type="button" data-action="admin-reset-editor" data-kind="${kind}">Use reference feed</button>
        <button class="button secondary" type="submit">Save ${escapeHtml(title)}</button>
      </div>
    </form>
  `;
}

function adminSyncRows(rows) {
  return rows.length
    ? rows.map((row) => `
        <article class="admin-row">
          <strong>${escapeHtml(row.endpoint || "endpoint")}</strong>
          <span>${escapeHtml([row.status, row.scope, row.recorded_at ? formatDate(row.recorded_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""].filter(Boolean).join(" · "))}</span>
        </article>`).join("")
    : `<div class="empty-state">No sync calls recorded yet.</div>`;
}

function adminSupportRows(rows) {
  return rows.length
    ? rows.map((row) => `
        <article class="admin-row">
          <div class="heading">
            <div>
              <strong>${escapeHtml(row.subject || "Support request")}</strong>
              <span>${escapeHtml([row.email, row.created_at ? formatDate(row.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""].filter(Boolean).join(" · "))}</span>
            </div>
            <button class="icon-button magenta" data-action="admin-clear-support" data-support-id="${escapeHtml(row.id || "")}" title="Clear request">${icon("close")}</button>
          </div>
          <p>${escapeHtml(row.message || "")}</p>
        </article>`).join("")
    : `<div class="empty-state">No support requests yet.</div>`;
}

function adminRawRows(rows) {
  return rows.length
    ? rows.map((row) => `
        <article class="admin-row">
          <strong>${escapeHtml(row.endpoint || "endpoint")}</strong>
          <span>${escapeHtml([row.status, row.scope, row.recorded_at ? formatDate(row.recorded_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""].filter(Boolean).join(" · "))}</span>
        </article>`).join("")
    : `<div class="empty-state">No cached API responses yet.</div>`;
}

function adminDailyAwardRows(pointsByLeague) {
  const rows = Object.values(pointsByLeague || {});
  return rows.length
    ? rows.slice(0, 12).map((row) => `
        <article class="admin-row">
          <strong>${escapeHtml(row.league_id || "League")}</strong>
          <span>${escapeHtml([row.updated_at ? formatDate(row.updated_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "", `${(row.breakdown || []).length} IST days`].filter(Boolean).join(" · "))}</span>
        </article>`).join("")
    : `<div class="empty-state">No league awards have been calculated yet.</div>`;
}

function privacyPage() {
  return appShell(staticPage("Privacy", `
    <p class="subcopy">This local app keeps sign-in tokens in your browser and stores app-only data such as fantasy teams, leagues and support requests on the local backend running in this workspace.</p>
    <p class="subcopy">Tournament data is read from the same public reference dataset used by the live WC26 app. Prediction flows are intentionally excluded from this build.</p>
    <a class="ghost-button accent" href="/" data-route="/">Back home</a>
  `, "cyan"));
}

function termsPage() {
  return appShell(staticPage("Terms", `
    <p class="subcopy">This is a local build for product exploration. It includes fantasy, standings, leagues and profile tools, without prediction.</p>
    <p class="subcopy">Use of this build does not create a paid service relationship, and no in-app donation or payment flow is active here.</p>
    <a class="ghost-button accent" href="/" data-route="/">Back home</a>
  `, "cyan"));
}

function authPage() {
  const tab = state.ui.authTab;
  const signin = state.ui.authForms.signin;
  const signup = state.ui.authForms.signup;
  return `
    <div class="app-shell">
      <div class="ambient"></div>
      <div class="auth-layout">
        <div class="auth-shell">
          <section class="hero-ring" style="width:min(100%, 340px); margin-inline:auto">
            <div class="hero-glow a"></div>
            <div class="hero-glow b"></div>
            <div class="ring-track">${flagRingHtml()}</div>
            <div class="ring-core">
              <h1 class="title" style="font-size:72px">WC26</h1>
              <p>Fantasy XI</p>
            </div>
          </section>
          <section class="auth-card panel">
            <div class="tab-row">
              ${tabButton("auth-tab", "signin", "Sign in", "magenta", tab)}
              ${tabButton("auth-tab", "signup", "Create account", "cyan", tab)}
            </div>
            ${
              tab === "signin"
                ? `<form class="stack" style="margin-top:16px" data-action="sign-in">
                    <div class="field"><label>Email</label><input class="field-input" name="email" type="email" autocomplete="email" value="${escapeHtml(signin.email)}" required></div>
                    <div class="field"><label>Password</label><input class="field-input" name="password" type="password" autocomplete="current-password" value="${escapeHtml(signin.password)}" required minlength="6"></div>
                    <div class="button-row hero-actions" style="justify-content:space-between">
                      <button class="ghost-button" type="button" data-action="open-reset">Forgot password?</button>
                      <button class="button primary" type="submit">Sign in</button>
                    </div>
                  </form>`
                : `<form class="stack" style="margin-top:16px" data-action="sign-up">
                    <div class="field"><label>Display name</label><input class="field-input" name="display_name" autocomplete="nickname" value="${escapeHtml(signup.display_name)}" required minlength="2" maxlength="32"></div>
                    <div class="field"><label>Email</label><input class="field-input" name="email" type="email" autocomplete="email" value="${escapeHtml(signup.email)}" required></div>
                    <div class="field"><label>Password</label><input class="field-input" name="password" type="password" autocomplete="new-password" value="${escapeHtml(signup.password)}" required minlength="6"></div>
                    <button class="button secondary" type="submit">Create account & start playing</button>
                  </form>`
            }
            <div class="auth-divider"><span class="eyebrow">or</span></div>
            <div class="grid-2">
              <button class="ghost-button" data-action="oauth-disabled">Apple</button>
              <button class="ghost-button" data-action="oauth-disabled">G Google</button>
            </div>
            <p class="small-meta" style="margin-top:14px; text-align:center">By continuing you agree to our <a href="/privacy" data-route="/privacy">Privacy Policy</a> · <a href="/support" data-route="/support">Support</a></p>
          </section>
        </div>
      </div>
    </div>
  `;
}

function loadingPanel() {
  return `
    <div class="page compact">
      <section class="panel stack">
        <div class="skeleton block"></div>
        <div class="skeleton block"></div>
        <div class="skeleton block"></div>
      </section>
    </div>
  `;
}

function renderPage() {
  if (state.loading) return appShell(loadingPanel());
  if (state.route === "/") return landingPage();
  if (state.route === "/admin") return adminPage();
  if (state.route === "/auth") return authPage();
  if (state.route === "/standings") return standingsPage();
  if (state.route === "/leaderboard") return leaderboardPage();
  if (state.route === "/fantasy") return fantasyPage();
  if (state.route === "/profile") return profilePage();
  if (state.route === "/help") return helpPage();
  if (state.route === "/support") return supportFaqPage();
  if (state.route === "/privacy") return privacyPage();
  if (state.route === "/terms") return termsPage();
  return landingPage();
}

function render() {
  if (deferredRenderTimer) {
    window.clearTimeout(deferredRenderTimer);
    deferredRenderTimer = null;
  }
  appNode.innerHTML = renderPage();
  renderOverlays();
  restoreFocus();
}

function scheduleRender(delay = 180) {
  if (deferredRenderTimer) window.clearTimeout(deferredRenderTimer);
  deferredRenderTimer = window.setTimeout(() => {
    deferredRenderTimer = null;
    render();
  }, delay);
}

function renderOverlays() {
  const modal = renderModal();
  const toasts = state.ui.toasts.length
    ? `<div class="toast-stack">${state.ui.toasts.map((toast) => `<div class="toast ${toast.kind}">${escapeHtml(toast.message)}</div>`).join("")}</div>`
    : "";
  overlayNode.innerHTML = `${modal}${toasts}`;
}

function focusDescriptor(target) {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return null;
  let start = null;
  let end = null;
  try {
    start = target.selectionStart;
    end = target.selectionEnd;
  } catch {
    start = null;
    end = null;
  }
  const form = target.form;
  if (form?.dataset.action && target.name) {
    return {
      formAction: form.dataset.action,
      name: target.name,
      start,
      end,
    };
  }
  if (target.id) {
    return {
      selector: `#${escapeSelector(target.id)}`,
      start,
      end,
    };
  }
  if (target.dataset.action) {
    return {
      selector: `[data-action="${escapeSelector(target.dataset.action)}"]`,
      start,
      end,
    };
  }
  return null;
}

function rememberFocus(target) {
  const descriptor = focusDescriptor(target);
  if (descriptor) state.ui.authFocus = descriptor;
}

function restoreFocus() {
  const focus = state.ui.authFocus;
  if (!focus) return;
  const selector = focus.selector || (focus.modal
    ? `.modal [name="${focus.name}"]`
    : `form[data-action="${focus.formAction}"] [name="${focus.name}"]`);
  const input = $(selector);
  if (!input) return;
  const applyFocus = () => {
    if (!input.isConnected) return;
    input.focus({ preventScroll: true });
    if (typeof focus.start === "number" && typeof input.setSelectionRange === "function") {
      try {
        input.setSelectionRange(focus.start, focus.end ?? focus.start);
      } catch {
        // Some browser/input type combinations disallow selection APIs.
      }
    }
  };
  applyFocus();
  requestAnimationFrame(applyFocus);
}

function renderModal() {
  if (!state.ui.modal) return "";
  if (state.ui.modal.type === "reset") {
    return `
      <div class="modal">
        <div class="modal-backdrop" data-action="close-modal"></div>
        <div class="modal-card">
          <div class="heading"><h2 class="neon-magenta">Reset your password</h2><button class="icon-button" data-action="close-modal">×</button></div>
          <p class="subcopy" style="margin-top:10px">We will send a reset email through Supabase auth.</p>
          <form class="stack" style="margin-top:14px" data-action="send-reset">
            <div class="field"><label>Email</label><input class="field-input" name="email" type="email" autocomplete="email" value="${escapeHtml(state.ui.authForms.reset.email || "")}" required></div>
            <button class="button primary" type="submit">Send reset email</button>
          </form>
        </div>
      </div>
    `;
  }
  if (state.ui.modal.type === "fixture") {
    const fixture = fixtureById(state.ui.modal.fixtureId);
    return fixture ? fixtureModalHtml(fixture) : "";
  }
  if (state.ui.modal.type === "league") {
    return leagueModalHtml();
  }
  return "";
}

function fixtureById(id) {
  return state.publicData.standings?.fixtures.find((fixture) => fixture.id === id);
}

function fixtureModalHtml(fixture) {
  const home = fixture.home_nation || nationMap()[fixture.home_nation_code];
  const away = fixture.away_nation || nationMap()[fixture.away_nation_code];
  const goals = (state.publicData.standings.goalEvents || []).filter((event) => event.fixture_id === fixture.id);
  const stats = (state.publicData.standings.playerStats?.fantasy_points || []).filter(() => false);
  return `
    <div class="modal">
      <div class="modal-backdrop" data-action="close-modal"></div>
      <div class="modal-card">
        <div class="heading">
          <div>
            <h2 class="neon-cyan">Match Events</h2>
            <p class="subcopy">${escapeHtml(`${home?.name || fixture.home_nation_code} vs ${away?.name || fixture.away_nation_code}`)}</p>
          </div>
          <button class="icon-button" data-action="close-modal">×</button>
        </div>
        <div class="surface" style="margin-top:14px">
          <div class="fixture-teams">
            <div class="team-line home"><span class="team-name">${escapeHtml(home?.name || fixture.home_nation_code || "TBD")}</span>${home ? flagImg(home.code, home.name) : ""}</div>
            <div class="score-pill">${fixture.home_score ?? "-"}-${fixture.away_score ?? "-"}</div>
            <div class="team-line">${away ? flagImg(away.code, away.name) : ""}<span class="team-name">${escapeHtml(away?.name || fixture.away_nation_code || "TBD")}</span></div>
          </div>
          <div class="small-meta" style="margin-top:8px; text-align:center">${escapeHtml([fixture.venue, fixture.city, formatDate(fixture.kickoff_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="stack" style="margin-top:14px">
          <section class="surface">
            <div class="heading"><h2 class="neon-magenta">Goal events</h2></div>
            ${goals.length ? `<div class="message-list" style="margin-top:12px">${goals.map((event) => `<div class="message-card"><strong>${escapeHtml(event.team_nation_code || "")}</strong><p style="margin-top:6px">${escapeHtml(`${event.minute || "-"}' · ${event.goal_type || "goal"}`)}</p></div>`).join("")}</div>` : `<div class="empty-state" style="margin-top:12px">No goal events recorded.</div>`}
          </section>
          <section class="surface">
            <div class="heading"><h2 class="neon-magenta">Player points</h2></div>
            ${stats.length ? "" : `<div class="empty-state" style="margin-top:12px">No player fantasy points recorded.</div>`}
          </section>
        </div>
      </div>
    </div>
  `;
}

function leagueModalHtml() {
  return `
    <div class="modal">
      <div class="modal-backdrop" data-action="close-modal"></div>
      <div class="modal-card">
        <div class="heading"><h2 class="neon-magenta">Fantasy Leagues</h2><button class="icon-button" data-action="close-modal">×</button></div>
        <div class="grid-2" style="margin-top:16px">
          <form class="surface stack" data-action="create-league">
            <div class="heading"><h2 class="neon-cyan">Create</h2></div>
            <input class="field-input" name="name" placeholder="League name" maxlength="40" required>
            <button class="button secondary" type="submit">Create league</button>
          </form>
          <form class="surface stack" data-action="join-league">
            <div class="heading"><h2 class="neon-cyan">Join</h2></div>
            <input class="field-input" name="invite_code" placeholder="Invite code" maxlength="6" required style="text-transform:uppercase; letter-spacing:0.3em; text-align:center">
            <button class="button secondary" type="submit">Join league</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function loadPublicData() {
  const [provider, nations, comingUp, standings, players, managers, faqs] = await Promise.all([
    api("/api/provider", { auth: false }),
    api("/api/nations", { auth: false }),
    api("/api/coming-up", { auth: false }),
    api("/api/standings", { auth: false }),
    api("/api/fantasy/players", { auth: false }),
    api("/api/fantasy/managers", { auth: false }),
    api("/api/help/faqs", { auth: false }),
  ]);
  state.provider = provider;
  state.publicData = { nations, fixtures: standings.fixtures, comingUp, standings, players, managers, faqs };
}

async function hydrateSession() {
  if (!state.session.token) return;
  const session = await api("/api/auth/me");
  state.session.user = session.user;
  state.session.profile = session.profile;
  state.session.team = session.fantasyTeam;
  state.session.notifications = session.notifications || [];
  state.session.leaderboard = session.leaderboard;
  hydrateDraft(session.fantasyTeam);
  try {
    state.session.supportMessages = await api("/api/support/messages");
  } catch {
    state.session.supportMessages = [];
  }
}

async function hydrateAdmin() {
  if (!state.admin.token) return;
  const session = await adminApi("/api/admin/me");
  state.admin.user = session;
  state.admin.dashboard = await adminApi("/api/admin/dashboard");
}

async function reloadAdminDashboard() {
  if (!state.admin.token) return;
  state.admin.dashboard = await adminApi("/api/admin/dashboard");
}

async function reloadAuthedData() {
  if (!state.session.user) return;
  const [leaderboard, team, profile, supportMessages] = await Promise.all([
    api("/api/leaderboard"),
    api("/api/fantasy/team"),
    api("/api/profile"),
    api("/api/support/messages"),
  ]);
  state.session.leaderboard = leaderboard;
  state.session.team = team;
  state.session.profile = profile;
  state.session.supportMessages = supportMessages;
  hydrateDraft(team);
}

async function boot() {
  render();
  try {
    await loadPublicData();
    if (state.session.token) {
      try {
        await hydrateSession();
      } catch {
        clearSession();
      }
    }
    if (state.admin.token) {
      try {
        await hydrateAdmin();
      } catch {
        clearAdminSession();
      }
    }
  } catch (error) {
    pushToast("error", error.message || "Could not load WC26.");
  } finally {
    state.loading = false;
    if (PROTECTED_ROUTES.has(state.route) && !state.session.user) state.route = "/auth";
    render();
  }
}

document.addEventListener("click", async (event) => {
  const actionNode = event.target.closest("[data-action]");
  const routeNode = event.target.closest("[data-route]");
  if (routeNode) {
    event.preventDefault();
    navigate(routeNode.dataset.route);
    return;
  }
  if (event.target.closest("input, textarea, select")) return;
  if (!actionNode || actionNode.tagName === "FORM") return;

  const action = actionNode.dataset.action;
  try {
    if (action === "close-modal") {
      state.ui.modal = null;
    } else if (action === "cycle-group") {
      state.ui.standingsGroup = (state.ui.standingsGroup + Number(actionNode.dataset.direction) + GROUPS.length) % GROUPS.length;
    } else if (action === "pick-group") {
      state.ui.standingsGroup = Number(actionNode.dataset.group);
    } else if (action === "auth-tab") {
      state.ui.authTab = actionNode.dataset.value;
    } else if (action === "standings-tab") {
      state.ui.standingsTab = actionNode.dataset.value;
    } else if (action === "fixtures-mode") {
      state.ui.fixturesMode = actionNode.dataset.value;
    } else if (action === "fantasy-filter") {
      state.ui.fantasyFilter = actionNode.dataset.value;
    } else if (action === "fantasy-tile") {
      state.ui.fantasyTile = actionNode.dataset.value;
    } else if (action === "toggle-player") {
      togglePlayer(actionNode.dataset.player);
      return;
    } else if (action === "toggle-starter") {
      toggleStarter(actionNode.dataset.player);
      return;
    } else if (action === "set-captain") {
      state.fantasyDraft.captain_id = actionNode.dataset.player;
      if (state.fantasyDraft.vice_captain_id === state.fantasyDraft.captain_id) {
        state.fantasyDraft.vice_captain_id = state.fantasyDraft.starters.find((id) => id !== state.fantasyDraft.captain_id) || "";
      }
    } else if (action === "set-vice") {
      if (actionNode.dataset.player !== state.fantasyDraft.captain_id) {
        state.fantasyDraft.vice_captain_id = actionNode.dataset.player;
      }
    } else if (action === "open-reset") {
      state.ui.authForms.reset.email = state.ui.authForms.signin.email || "";
      state.ui.authFocus = { modal: true, name: "email" };
      state.ui.modal = { type: "reset" };
    } else if (action === "oauth-disabled") {
      pushToast("error", "Email auth is active here. OAuth is not wired into the localhost build.");
    } else if (action === "open-fixture") {
      state.ui.modal = { type: "fixture", fixtureId: actionNode.dataset.fixture };
    } else if (action === "league-scope") {
      state.ui.activeLeagueId = actionNode.dataset.value;
    } else if (action === "open-create-league") {
      state.ui.modal = { type: "league" };
    } else if (action === "copy-code") {
      await navigator.clipboard.writeText(actionNode.dataset.code);
      pushToast("success", `Invite code ${actionNode.dataset.code} copied.`);
    } else if (action === "leave-league") {
      await api("/api/leagues/leave", { method: "POST", body: JSON.stringify({ league_id: actionNode.dataset.league }) });
      await reloadAuthedData();
      state.ui.activeLeagueId = "global";
      pushToast("success", "League left.");
    } else if (action === "delete-league") {
      await api("/api/leagues/delete", { method: "POST", body: JSON.stringify({ league_id: actionNode.dataset.league }) });
      await reloadAuthedData();
      state.ui.activeLeagueId = "global";
      pushToast("success", "League deleted.");
    } else if (action === "sign-out") {
      clearSession();
      navigate("/", true);
      pushToast("success", "Signed out.");
      return;
    } else if (action === "delete-local-account") {
      await api("/api/profile/delete-local", { method: "POST", body: JSON.stringify({}) });
      clearSession();
      navigate("/", true);
      pushToast("success", "Local WC26 data deleted.");
      return;
    } else if (action === "save-team") {
      await api("/api/fantasy/team", { method: "POST", body: JSON.stringify(state.fantasyDraft) });
      await reloadAuthedData();
      pushToast("success", "Fantasy XI saved.");
    } else if (action === "focus-player") {
      const player = playerMap()[actionNode.dataset.player];
      if (player) pushToast("success", `${player.name} is in your starting XI.`);
    } else if (action === "admin-refresh-provider") {
      state.admin.dashboard = await adminApi("/api/admin/provider/refresh", { method: "POST", body: JSON.stringify({}) });
      pushToast("success", "API status refreshed.");
    } else if (action === "admin-recompute-scoring") {
      state.admin.dashboard = await adminApi("/api/admin/scoring/recompute", { method: "POST", body: JSON.stringify({}) });
      pushToast("success", "League awards recalculated.");
    } else if (action === "admin-reset-quota") {
      state.admin.dashboard = await adminApi("/api/admin/quota/reset", { method: "POST", body: JSON.stringify({}) });
      pushToast("success", "Local quota tracker reset.");
    } else if (action === "admin-import-editor") {
      state.admin.dashboard = await adminApi("/api/admin/editor/import", { method: "POST", body: JSON.stringify({ kind: actionNode.dataset.kind }) });
      pushToast("success", `${actionNode.dataset.kind} imported into the editable store.`);
    } else if (action === "admin-reset-editor") {
      state.admin.dashboard = await adminApi("/api/admin/editor/reset", { method: "POST", body: JSON.stringify({ kind: actionNode.dataset.kind }) });
      pushToast("success", `${actionNode.dataset.kind} switched back to the reference feed.`);
    } else if (action === "admin-clear-support") {
      state.admin.dashboard = await adminApi("/api/admin/support/clear", { method: "POST", body: JSON.stringify({ id: actionNode.dataset.supportId }) });
      pushToast("success", "Support request cleared.");
    } else if (action === "admin-sign-out") {
      await adminApi("/api/admin/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => ({}));
      clearAdminSession();
      pushToast("success", "Admin signed out.");
    }
  } catch (error) {
    pushToast("error", error.message || "Action failed.");
  }
  render();
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  let changed = false;
  const form = target.form;
  if (form?.dataset.action === "sign-in" && target.name in state.ui.authForms.signin) {
    state.ui.authForms.signin[target.name] = target.value;
    rememberFocus(target);
  } else if (form?.dataset.action === "sign-up" && target.name in state.ui.authForms.signup) {
    state.ui.authForms.signup[target.name] = target.value;
    rememberFocus(target);
  } else if (form?.dataset.action === "send-reset" && target.name in state.ui.authForms.reset) {
    state.ui.authForms.reset[target.name] = target.value;
    rememberFocus(target);
  }
  if (target.matches("[data-action='fixtures-nation']")) {
    state.ui.fixturesNation = target.value;
    changed = true;
  } else if (target.matches("[data-action='fixtures-group']")) {
    state.ui.fixturesGroup = target.value;
    changed = true;
  } else if (target.matches("[data-action='manager-select']")) {
    state.fantasyDraft.manager_id = target.value;
    changed = true;
  }
  if (changed) render();
});

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
  rememberFocus(target);
  const form = target.form;
  if (form?.dataset.action === "sign-in" && target.name in state.ui.authForms.signin) {
    rememberFocus(target);
  } else if (form?.dataset.action === "sign-up" && target.name in state.ui.authForms.signup) {
    rememberFocus(target);
  } else if (form?.dataset.action === "send-reset" && target.name in state.ui.authForms.reset) {
    rememberFocus(target);
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  let changed = false;
  const form = target.form;
  if (form?.dataset.action === "sign-in" && target.name in state.ui.authForms.signin) {
    state.ui.authForms.signin[target.name] = target.value;
    rememberFocus(target);
  } else if (form?.dataset.action === "sign-up" && target.name in state.ui.authForms.signup) {
    state.ui.authForms.signup[target.name] = target.value;
    rememberFocus(target);
  } else if (form?.dataset.action === "send-reset" && target.name in state.ui.authForms.reset) {
    state.ui.authForms.reset[target.name] = target.value;
    rememberFocus(target);
  } else if (form?.dataset.action === "admin-login" && target.name in state.ui.authForms.admin) {
    state.ui.authForms.admin[target.name] = target.value;
    rememberFocus(target);
  } else if (target.matches("[data-action='fantasy-search']")) {
    state.ui.fantasySearch = target.value;
    rememberFocus(target);
    changed = true;
  } else if (target.matches("[data-action='team-name']")) {
    state.fantasyDraft.team_name = target.value.slice(0, 32);
    rememberFocus(target);
    changed = true;
  }
  if (changed) scheduleRender();
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.action === "sign-in") {
      const payload = await api("/api/auth/signin", { method: "POST", auth: false, body: JSON.stringify(data) });
      setSessionTokens(payload.access_token, payload.refresh_token);
      state.ui.authFocus = null;
      await hydrateSession();
      navigate("/fantasy", true);
      pushToast("success", "Signed in.");
      return;
    }
    if (form.dataset.action === "sign-up") {
      const payload = await api("/api/auth/signup", { method: "POST", auth: false, body: JSON.stringify(data) });
      if (payload.access_token) {
        setSessionTokens(payload.access_token, payload.refresh_token);
        state.ui.authFocus = null;
        await hydrateSession();
        navigate("/fantasy", true);
        pushToast("success", "Account created.");
      } else {
        pushToast("success", "Account created. Check your email to confirm.");
      }
      return;
    }
    if (form.dataset.action === "send-reset") {
      await api("/api/auth/recover", { method: "POST", auth: false, body: JSON.stringify(data) });
      state.ui.authFocus = null;
      state.ui.modal = null;
      pushToast("success", "Reset email sent.");
    }
    if (form.dataset.action === "admin-login") {
      const payload = await adminApi("/api/admin/login", { method: "POST", body: JSON.stringify(data) });
      setAdminToken(payload.token);
      state.admin.user = payload.admin;
      state.admin.dashboard = await adminApi("/api/admin/dashboard");
      state.ui.authForms.admin.password = "";
      state.ui.authFocus = null;
      pushToast("success", "Admin signed in.");
      render();
      return;
    }
    if (form.dataset.action === "admin-save-editor") {
      let parsed;
      try {
        parsed = JSON.parse(data.payload || "");
      } catch {
        throw new Error("Editor content must be valid JSON.");
      }
      state.admin.dashboard = await adminApi("/api/admin/editor/save", {
        method: "POST",
        body: JSON.stringify({ kind: data.kind, payload: parsed }),
      });
      pushToast("success", `${data.kind} saved.`);
      render();
      return;
    }
    if (form.dataset.action === "create-league") {
      await api("/api/leagues/create", { method: "POST", body: JSON.stringify(data) });
      await reloadAuthedData();
      state.ui.modal = null;
      pushToast("success", "League created.");
    }
    if (form.dataset.action === "join-league") {
      await api("/api/leagues/join", { method: "POST", body: JSON.stringify(data) });
      await reloadAuthedData();
      state.ui.modal = null;
      pushToast("success", "League joined.");
    }
    if (form.dataset.action === "save-profile-name") {
      state.session.profile = await api("/api/profile", { method: "POST", body: JSON.stringify({ display_name: data.display_name }) });
      if (state.session.leaderboard) await reloadAuthedData();
      pushToast("success", "Display name updated.");
    }
    if (form.dataset.action === "save-profile-prefs") {
      state.session.profile = await api("/api/profile", { method: "POST", body: JSON.stringify(data) });
      pushToast("success", "Preferences updated.");
    }
    if (form.dataset.action === "send-support") {
      await api("/api/support", { method: "POST", body: JSON.stringify(data) });
      await reloadAuthedData();
      form.reset();
      pushToast("success", "Support request sent.");
    }
  } catch (error) {
    pushToast("error", error.message || "Request failed.");
  }
  render();
});

window.addEventListener("popstate", () => {
  state.route = normalizePath(location.pathname);
  if (PROTECTED_ROUTES.has(state.route) && !state.session.user) state.route = "/auth";
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.ui.modal) {
    state.ui.modal = null;
    renderOverlays();
  }
});

boot();
