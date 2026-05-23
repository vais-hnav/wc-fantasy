#!/usr/bin/env python3
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
CACHE_DIR = ROOT / ".cache"
DATA_DIR = ROOT / ".data"
CACHE_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

DEFAULT_SUPABASE_URL = "https://zshrsduuisxkoinwpwjg.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHJzZHV1aXN4a29pbndwd2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NzI5NTIsImV4cCI6MjA5MzQ0ODk1Mn0."
    "XuOvoD42IjBfMSRVRj1acLcKKBHxUbOwNuUX6VqPmUQ"
)

FILE_LOCK = threading.Lock()

PROFILE_STORE = DATA_DIR / "profiles.json"
FANTASY_STORE = DATA_DIR / "fantasy_teams.json"
LEAGUE_STORE = DATA_DIR / "leagues.json"
NOTIFICATION_STORE = DATA_DIR / "notifications.json"
SUPPORT_STORE = DATA_DIR / "support_messages.json"
API_REQUEST_USAGE_STORE = DATA_DIR / "api_request_usage.json"
API_SYNC_LOGS_STORE = DATA_DIR / "api_sync_logs.json"
RAW_API_RESPONSES_STORE = DATA_DIR / "raw_api_responses.json"
LEAGUE_DAILY_POINTS_STORE = DATA_DIR / "league_daily_points.json"
ADMIN_SESSIONS_STORE = DATA_DIR / "admin_sessions.json"
EDITABLE_FIXTURES_STORE = DATA_DIR / "editable_fixtures.json"
EDITABLE_PLAYERS_STORE = DATA_DIR / "editable_players.json"
EDITABLE_MANAGERS_STORE = DATA_DIR / "editable_managers.json"
EDITABLE_GOAL_EVENTS_STORE = DATA_DIR / "editable_goal_events.json"
EDITABLE_MATCH_PLAYER_STATS_STORE = DATA_DIR / "editable_match_player_stats.json"
SCORING_RULES_STORE = DATA_DIR / "scoring_rules.json"

HOST_NATIONS = ["USA", "CAN", "MEX"]
GROUP_LETTERS = list("ABCDEFGHIJKL")
SQUAD_LIMITS = {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}
STARTER_LIMITS = {"GK": 1, "DEF": 4, "MID": 4, "FWD": 2}
DEFAULT_TIME_ZONE = "Asia/Kolkata"
LOCAL_TZ = ZoneInfo(DEFAULT_TIME_ZONE)
FPL_GOAL_POINTS = {"GK": 10, "DEF": 6, "MID": 5, "FWD": 4}
FPL_CLEAN_SHEET_POINTS = {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0}
API_SPORTS_DAILY_LIMIT = 100
API_SPORTS_DAILY_RESERVE = 30
API_SPORTS_MINUTE_LIMIT = 10
API_SPORTS_RESET_UTC = "00:00"
EDITOR_KIND_CONFIG = {
    "fixtures": EDITABLE_FIXTURES_STORE,
    "players": EDITABLE_PLAYERS_STORE,
    "managers": EDITABLE_MANAGERS_STORE,
    "goalEvents": EDITABLE_GOAL_EVENTS_STORE,
    "matchPlayerStats": EDITABLE_MATCH_PLAYER_STATS_STORE,
    "scoringRules": SCORING_RULES_STORE,
}


def load_dotenv():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_dotenv()

DB_READY = False


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def json_response(handler, payload, status=HTTPStatus.OK):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler, message, status=HTTPStatus.BAD_REQUEST):
    json_response(handler, {"error": message}, status)


def read_body_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length).decode("utf-8") if length else ""
    try:
        return json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON payload.") from exc


def fetch_json(url, headers=None, timeout=15):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def request_json(url, method="GET", headers=None, payload=None, timeout=15):
    encoded = None
    merged_headers = dict(headers or {})
    if payload is not None:
        encoded = json.dumps(payload).encode("utf-8")
        merged_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, method=method, headers=merged_headers, data=encoded)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            return response.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"error": body or exc.reason}
        return exc.code, payload


def read_cache(name, max_age_seconds):
    path = CACHE_DIR / f"{name}.json"
    if not path.exists():
        return None
    age = time.time() - path.stat().st_mtime
    if age > max_age_seconds:
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_cache(name, payload):
    path = CACHE_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def with_cache(name, max_age_seconds, producer, fallback):
    cached = read_cache(name, max_age_seconds)
    if cached is not None:
        return cached
    try:
        payload = producer()
        write_cache(name, payload)
        return payload
    except Exception:
        stale_path = CACHE_DIR / f"{name}.json"
        if stale_path.exists():
            return json.loads(stale_path.read_text(encoding="utf-8"))
        return fallback


def database_url():
    return os.getenv("DATABASE_URL", "").strip()


def store_name(path):
    return Path(path).stem


def clone_default(default):
    return json.loads(json.dumps(default))


def ensure_database():
    global DB_READY
    if DB_READY:
        return
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("DATABASE_URL is set, but psycopg is not installed.") from exc
    with FILE_LOCK:
        if DB_READY:
            return
        with psycopg.connect(database_url(), autocommit=True) as conn:
            conn.execute(
                """
                create table if not exists app_stores (
                    name text primary key,
                    payload jsonb not null,
                    updated_at timestamptz not null default now()
                )
                """
            )
        DB_READY = True


def load_database_store(path, default):
    from psycopg.types.json import Jsonb

    ensure_database()
    name = store_name(path)
    with FILE_LOCK:
        import psycopg

        with psycopg.connect(database_url(), autocommit=True) as conn:
            row = conn.execute("select payload from app_stores where name = %s", (name,)).fetchone()
            if row:
                return row[0]
            payload = clone_default(default)
            if Path(path).exists():
                try:
                    payload = json.loads(Path(path).read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    payload = clone_default(default)
            conn.execute(
                """
                insert into app_stores (name, payload, updated_at)
                values (%s, %s, now())
                on conflict (name) do nothing
                """,
                (name, Jsonb(payload)),
            )
            return payload


def save_database_store(path, payload):
    from psycopg.types.json import Jsonb

    ensure_database()
    with FILE_LOCK:
        import psycopg

        with psycopg.connect(database_url(), autocommit=True) as conn:
            conn.execute(
                """
                insert into app_stores (name, payload, updated_at)
                values (%s, %s, now())
                on conflict (name)
                do update set payload = excluded.payload, updated_at = now()
                """,
                (store_name(path), Jsonb(payload)),
            )


def load_store(path, default):
    if database_url():
        return load_database_store(path, default)
    with FILE_LOCK:
        if not path.exists():
            return clone_default(default)
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return clone_default(default)


def save_store(path, payload):
    if database_url():
        save_database_store(path, payload)
        return
    temp = path.with_suffix(path.suffix + ".tmp")
    with FILE_LOCK:
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)


def supabase_url():
    return os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")


def supabase_headers(token=None):
    key = os.getenv("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY)
    bearer = token or key
    return {
        "apikey": key,
        "Authorization": f"Bearer {bearer}",
        "Accept": "application/json",
    }


def supabase_rest_url(table, params=None):
    query = urllib.parse.urlencode(params or {}, safe="*,.()")
    base = f"{supabase_url()}/rest/v1/{table}"
    return f"{base}?{query}" if query else base


def supabase_auth_url(path):
    return f"{supabase_url()}/auth/v1/{path.lstrip('/')}"


def fetch_table(table, cache_seconds=900, params=None, fallback=None):
    fallback = fallback if fallback is not None else []

    def producer():
        return fetch_json(supabase_rest_url(table, params or {"select": "*"}), supabase_headers())

    return with_cache(table, cache_seconds, producer, fallback)


def editable_rows(store_path, supplier):
    rows = load_store(store_path, [])
    return rows if rows else supplier()


def store_has_local_rows(store_path):
    rows = load_store(store_path, [])
    return bool(rows)


def scoring_rules_default():
    return {
        "appearance_under_60": 1,
        "appearance_60_plus": 2,
        "assist": 3,
        "save_block": 3,
        "save_points": 1,
        "penalty_save": 5,
        "goals_conceded_block": 2,
        "goals_conceded_penalty": -1,
        "penalty_miss": -2,
        "yellow_card": -1,
        "red_card": -3,
        "own_goal": -2,
        "goal_points": dict(FPL_GOAL_POINTS),
        "clean_sheet_points": dict(FPL_CLEAN_SHEET_POINTS),
        "league_awards": {"first": 3, "second": 1, "rest": 0},
    }


def current_scoring_rules():
    stored = load_store(SCORING_RULES_STORE, {})
    rules = scoring_rules_default()
    goal_points = dict(rules["goal_points"])
    goal_points.update(stored.get("goal_points") or {})
    clean_sheet_points = dict(rules["clean_sheet_points"])
    clean_sheet_points.update(stored.get("clean_sheet_points") or {})
    league_awards = dict(rules["league_awards"])
    league_awards.update(stored.get("league_awards") or {})
    for key, value in stored.items():
        if key in {"goal_points", "clean_sheet_points", "league_awards"}:
            continue
        rules[key] = value
    rules["goal_points"] = goal_points
    rules["clean_sheet_points"] = clean_sheet_points
    rules["league_awards"] = league_awards
    return rules


def get_nations():
    return fetch_table(
        "nations",
        params={"select": "*", "order": "group_letter.asc,name.asc"},
        fallback=[],
    )


def get_fixtures_reference():
    return fetch_table(
        "fixtures",
        params={"select": "*", "order": "kickoff_at.asc"},
        fallback=[],
    )


def get_fixtures():
    return editable_rows(EDITABLE_FIXTURES_STORE, get_fixtures_reference)


def get_players_reference():
    return fetch_table(
        "players",
        params={"select": "*", "order": "price_millions.desc,name.asc"},
        fallback=[],
    )


def get_players():
    return editable_rows(EDITABLE_PLAYERS_STORE, get_players_reference)


def get_managers_reference():
    return fetch_table(
        "managers",
        params={"select": "*", "order": "price_millions.desc,name.asc"},
        fallback=[],
    )


def get_managers():
    return editable_rows(EDITABLE_MANAGERS_STORE, get_managers_reference)


def get_community_posts():
    return fetch_table(
        "community_posts",
        params={"select": "*", "published": "eq.true", "order": "created_at.desc"},
        fallback=[],
    )


def get_news_articles():
    return fetch_table(
        "news_articles",
        params={"select": "*", "order": "published_at.desc"},
        fallback=[],
    )


def get_match_goal_events_reference():
    return fetch_table(
        "match_goal_events",
        params={"select": "*", "order": "minute.asc"},
        fallback=[],
    )


def get_match_goal_events():
    return editable_rows(EDITABLE_GOAL_EVENTS_STORE, get_match_goal_events_reference)


def get_match_player_stats_reference():
    return fetch_table(
        "match_player_stats",
        params={"select": "*", "order": "fantasy_points.desc"},
        fallback=[],
    )


def get_match_player_stats():
    return editable_rows(EDITABLE_MATCH_PLAYER_STATS_STORE, get_match_player_stats_reference)


def nation_map():
    return {nation["code"]: nation for nation in get_nations()}


def player_map():
    return {player["id"]: player for player in get_players()}


def manager_map():
    return {manager["id"]: manager for manager in get_managers()}


def iso_to_datetime(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def next_coming_up():
    fixtures = get_fixtures()
    nations_by_code = nation_map()
    now = datetime.now(timezone.utc)
    upcoming = []
    for fixture in fixtures:
        try:
            kickoff = iso_to_datetime(fixture["kickoff_at"])
        except Exception:
            continue
        if kickoff >= now:
            upcoming.append((kickoff, fixture))
    upcoming.sort(key=lambda item: item[0])
    if not upcoming:
        return {"day": None, "fixtures": []}

    day = upcoming[0][0].date()
    day_fixtures = []
    for kickoff, fixture in upcoming:
        if kickoff.date() != day:
            continue
        enriched = dict(fixture)
        enriched["home_nation"] = nations_by_code.get(fixture.get("home_nation_code"))
        enriched["away_nation"] = nations_by_code.get(fixture.get("away_nation_code"))
        day_fixtures.append(enriched)
    return {"day": day.isoformat(), "fixtures": day_fixtures}


def table_for_group(fixtures, nations):
    rows = {
        nation["code"]: {
            "nation": nation,
            "played": 0,
            "w": 0,
            "d": 0,
            "l": 0,
            "gf": 0,
            "ga": 0,
            "gd": 0,
            "pts": 0,
        }
        for nation in nations
    }

    for fixture in fixtures:
        if not fixture.get("finished"):
            continue
        home_code = fixture.get("home_nation_code")
        away_code = fixture.get("away_nation_code")
        home_score = fixture.get("home_score")
        away_score = fixture.get("away_score")
        if home_code not in rows or away_code not in rows:
            continue
        if home_score is None or away_score is None:
            continue
        home = rows[home_code]
        away = rows[away_code]
        home["played"] += 1
        away["played"] += 1
        home["gf"] += home_score
        home["ga"] += away_score
        away["gf"] += away_score
        away["ga"] += home_score
        if home_score > away_score:
            home["w"] += 1
            away["l"] += 1
            home["pts"] += 3
        elif home_score < away_score:
            away["w"] += 1
            home["l"] += 1
            away["pts"] += 3
        else:
            home["d"] += 1
            away["d"] += 1
            home["pts"] += 1
            away["pts"] += 1

    for row in rows.values():
        row["gd"] = row["gf"] - row["ga"]

    return sorted(
        rows.values(),
        key=lambda row: (
            -row["pts"],
            -row["gd"],
            -row["gf"],
            row["nation"]["name"],
        ),
    )


def build_group_tables():
    fixtures = get_fixtures()
    nations = get_nations()
    tables = {}
    for letter in GROUP_LETTERS:
        group_nations = [nation for nation in nations if nation.get("group_letter") == letter]
        group_fixtures = [fixture for fixture in fixtures if fixture.get("stage") == "group" and fixture.get("group_letter") == letter]
        tables[letter] = table_for_group(group_fixtures, group_nations)
    return tables


def build_best_thirds(group_tables):
    thirds = []
    for letter in GROUP_LETTERS:
        table = group_tables.get(letter, [])
        if len(table) < 3:
            continue
        row = dict(table[2])
        row["group"] = letter
        thirds.append(row)

    thirds.sort(
        key=lambda row: (
            -row["pts"],
            -row["gd"],
            -row["gf"],
            row["nation"]["name"],
        )
    )

    ranked = []
    for index, row in enumerate(thirds, start=1):
        qualified = index <= 8
        ranked.append(
            {
                "rank": index,
                "group": row["group"],
                "qualified": qualified,
                **row,
            }
        )
    return ranked


def build_bracket():
    stage_order = ["r32", "r16", "qf", "sf", "third", "final"]
    grouped = {stage: [] for stage in stage_order}
    for fixture in get_fixtures():
        stage = fixture.get("stage")
        if stage in grouped:
            grouped[stage].append(fixture)
    for stage in grouped:
        grouped[stage].sort(key=lambda item: item.get("kickoff_at") or "")
    return grouped


def player_stat_leaders():
    stats = get_match_player_stats()
    if not stats:
        return {metric: [] for metric in ["goals", "clean_sheets", "yellow_cards", "red_cards", "minutes", "fantasy_points"]}

    players = player_map()
    metrics = ["goals", "clean_sheets", "yellow_cards", "red_cards", "minutes", "fantasy_points"]
    buckets = {metric: {} for metric in metrics}
    for row in stats:
        player = players.get(row.get("player_id"))
        if not player:
            continue
        for metric in metrics:
            value = row.get(metric) or 0
            if value <= 0:
                continue
            entry = buckets[metric].setdefault(
                row["player_id"],
                {
                    "player_id": row["player_id"],
                    "player_name": player.get("name"),
                    "nation_code": player.get("nation_code"),
                    "position": player.get("position"),
                    "total": 0,
                },
            )
            entry["total"] += value

    leaders = {}
    for metric, entries in buckets.items():
        ordered = sorted(entries.values(), key=lambda item: (-item["total"], item["player_name"] or ""))
        leaders[metric] = ordered[:20]
    return leaders


def normalized_headers(headers):
    return {str(key).lower(): value for key, value in (headers or {}).items()}


def header_int(headers, name):
    value = normalized_headers(headers).get(name.lower())
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def utc_day_key():
    return datetime.now(timezone.utc).date().isoformat()


def prune_recent_api_attempts(attempts):
    cutoff = time.time() - 60
    recent = []
    for attempt in attempts or []:
        try:
            stamp = float(attempt)
        except (TypeError, ValueError):
            continue
        if stamp >= cutoff:
            recent.append(stamp)
    return recent


def normalize_api_usage_state(payload):
    state = dict(payload or {})
    today = utc_day_key()
    state.setdefault("daily_limit", API_SPORTS_DAILY_LIMIT)
    state.setdefault("daily_remaining", API_SPORTS_DAILY_LIMIT)
    state.setdefault("minute_limit", API_SPORTS_MINUTE_LIMIT)
    state.setdefault("minute_remaining", API_SPORTS_MINUTE_LIMIT)
    state.setdefault("reserve_limit", API_SPORTS_DAILY_RESERVE)
    state.setdefault("reset_time_utc", API_SPORTS_RESET_UTC)
    state.setdefault("day_key", today)
    state.setdefault("recent_attempts", [])
    changed = False

    if state.get("day_key") != today:
        state["day_key"] = today
        state["daily_remaining"] = int(state.get("daily_limit") or API_SPORTS_DAILY_LIMIT)
        state["recent_attempts"] = []
        changed = True

    recent_attempts = prune_recent_api_attempts(state.get("recent_attempts"))
    if recent_attempts != list(state.get("recent_attempts") or []):
        state["recent_attempts"] = recent_attempts
        changed = True

    state["daily_limit"] = int(state.get("daily_limit") or API_SPORTS_DAILY_LIMIT)
    state["daily_remaining"] = max(0, int(state.get("daily_remaining") or 0))
    state["minute_limit"] = int(state.get("minute_limit") or API_SPORTS_MINUTE_LIMIT)
    state["minute_remaining"] = max(0, state["minute_limit"] - len(state["recent_attempts"]))
    state["reserve_limit"] = max(0, int(state.get("reserve_limit") or API_SPORTS_DAILY_RESERVE))
    state["reset_time_utc"] = str(state.get("reset_time_utc") or API_SPORTS_RESET_UTC)

    if changed:
        save_store(API_REQUEST_USAGE_STORE, state)
    return state


def read_api_usage_state():
    return normalize_api_usage_state(
        load_store(
            API_REQUEST_USAGE_STORE,
            {
                "daily_limit": API_SPORTS_DAILY_LIMIT,
                "daily_remaining": API_SPORTS_DAILY_LIMIT,
                "minute_limit": API_SPORTS_MINUTE_LIMIT,
                "minute_remaining": API_SPORTS_MINUTE_LIMIT,
                "reserve_limit": API_SPORTS_DAILY_RESERVE,
                "reset_time_utc": API_SPORTS_RESET_UTC,
                "day_key": utc_day_key(),
                "recent_attempts": [],
                "last_checked_at": None,
                "source": "docs",
            },
        )
    )


def write_api_usage_state(payload):
    save_store(API_REQUEST_USAGE_STORE, normalize_api_usage_state(payload))


def reset_local_api_usage_state():
    state = {
        "daily_limit": API_SPORTS_DAILY_LIMIT,
        "daily_remaining": API_SPORTS_DAILY_LIMIT,
        "minute_limit": API_SPORTS_MINUTE_LIMIT,
        "minute_remaining": API_SPORTS_MINUTE_LIMIT,
        "reserve_limit": API_SPORTS_DAILY_RESERVE,
        "reset_time_utc": API_SPORTS_RESET_UTC,
        "day_key": utc_day_key(),
        "recent_attempts": [],
        "last_checked_at": now_iso(),
        "source": "admin-reset",
    }
    write_api_usage_state(state)
    record_api_activity("local/quota-reset", "admin", scope="admin")
    return read_api_usage_state()


def reserve_api_request(priority="normal"):
    usage = read_api_usage_state()
    if usage["daily_remaining"] <= 0:
        return False, usage, "API-Football daily quota is exhausted."
    if priority != "critical" and usage["daily_remaining"] <= usage.get("reserve_limit", API_SPORTS_DAILY_RESERVE):
        return False, usage, "API-Football reserve is protected."
    if usage["minute_remaining"] <= 0:
        return False, usage, "API-Football minute limit reached."
    usage["recent_attempts"] = prune_recent_api_attempts(usage.get("recent_attempts"))
    usage["recent_attempts"].append(time.time())
    usage["daily_remaining"] = max(0, int(usage["daily_remaining"]) - 1)
    usage["minute_remaining"] = max(0, int(usage["minute_limit"]) - len(usage["recent_attempts"]))
    usage["last_checked_at"] = now_iso()
    usage["source"] = "budget"
    write_api_usage_state(usage)
    return True, usage, None


def record_api_activity(endpoint, status, headers=None, params=None, payload=None, scope="api-football"):
    normalized = normalized_headers(headers)
    usage = read_api_usage_state()
    daily_limit = header_int(normalized, "x-ratelimit-requests-limit")
    daily_remaining = header_int(normalized, "x-ratelimit-requests-remaining")
    minute_limit = header_int(normalized, "x-ratelimit-limit")
    minute_remaining = header_int(normalized, "x-ratelimit-remaining")
    if daily_limit is not None:
        usage["daily_limit"] = daily_limit
    if daily_remaining is not None:
        usage["daily_remaining"] = daily_remaining
    if minute_limit is not None:
        usage["minute_limit"] = minute_limit
    if minute_remaining is not None:
        usage["minute_remaining"] = minute_remaining
    usage["last_checked_at"] = now_iso()
    usage["source"] = scope
    write_api_usage_state(usage)

    sync_logs = load_store(API_SYNC_LOGS_STORE, [])
    sync_logs.insert(
        0,
        {
            "id": uuid.uuid4().hex,
            "endpoint": endpoint,
            "status": status,
            "params": params or {},
            "recorded_at": now_iso(),
            "scope": scope,
        },
    )
    save_store(API_SYNC_LOGS_STORE, sync_logs[:100])

    raw_responses = load_store(RAW_API_RESPONSES_STORE, [])
    raw_responses.insert(
        0,
        {
            "id": uuid.uuid4().hex,
            "endpoint": endpoint,
            "status": status,
            "params": params or {},
            "headers": {
                "x-ratelimit-requests-limit": normalized.get("x-ratelimit-requests-limit"),
                "x-ratelimit-requests-remaining": normalized.get("x-ratelimit-requests-remaining"),
                "x-ratelimit-limit": normalized.get("x-ratelimit-limit"),
                "x-ratelimit-remaining": normalized.get("x-ratelimit-remaining"),
            },
            "payload": payload,
            "recorded_at": now_iso(),
            "scope": scope,
        },
    )
    save_store(RAW_API_RESPONSES_STORE, raw_responses[:50])


def api_sports_get(path, params=None, timeout=15, priority="normal"):
    key = os.getenv("API_FOOTBALL_KEY", "")
    if not key:
        raise ValueError("API-FOOTBALL key is not configured.")
    allowed, usage, reason = reserve_api_request(priority=priority)
    if not allowed:
        payload = {"errors": [reason], "response": []}
        record_api_activity(path, 429, None, params, payload, scope="blocked")
        return 429, payload, None
    query = urllib.parse.urlencode(params or {}, safe="*,.()")
    url = f"https://v3.football.api-sports.io{path}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "x-apisports-key": key,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body) if body else {}
            record_api_activity(path, response.status, response.headers, params, payload)
            return response.status, payload, response.headers
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"errors": [body or exc.reason]}
        record_api_activity(path, exc.code, exc.headers, params, payload)
        return exc.code, payload, exc.headers
    except urllib.error.URLError as exc:
        payload = {"errors": [str(getattr(exc, "reason", exc))], "response": []}
        record_api_activity(path, 499, None, params, payload)
        return 499, payload, None


def get_provider_status():
    def enrich_provider_payload(payload):
        enriched = dict(payload or {})
        enriched.setdefault("quota", read_api_usage_state())
        enriched.setdefault(
            "policy",
            {
                "mode": "delayed-live",
                "daily_limit": API_SPORTS_DAILY_LIMIT,
                "reserve": API_SPORTS_DAILY_RESERVE,
                "minute_limit": API_SPORTS_MINUTE_LIMIT,
                "reset_time_utc": API_SPORTS_RESET_UTC,
            },
        )
        return enriched

    key = os.getenv("API_FOOTBALL_KEY", "")
    if not key:
        return enrich_provider_payload(
            {
                "configured": False,
                "active": False,
                "message": "API-FOOTBALL key is not configured.",
            }
        )

    def producer():
        status, payload, headers = api_sports_get("/status", timeout=10, priority="critical")
        if status != 200:
            raise ValueError("API-FOOTBALL status unavailable.")
        response = payload.get("response", {})
        subscription = response.get("subscription", {})
        requests = response.get("requests", {})
        return {
            "configured": True,
            "active": bool(subscription.get("active")),
            "plan": subscription.get("plan"),
            "dailyRequestsUsed": requests.get("current"),
            "dailyRequestsLimit": requests.get("limit_day"),
            "dailyRequestsRemaining": header_int(headers, "x-ratelimit-requests-remaining"),
            "minuteRequestsLimit": header_int(headers, "x-ratelimit-limit"),
            "minuteRequestsRemaining": header_int(headers, "x-ratelimit-remaining"),
            "message": "API-FOOTBALL connected. Reference data is cached locally and live syncs stay server-side only.",
        }
        return enrich_provider_payload(result)

    return enrich_provider_payload(with_cache(
        "api_football_status",
        12 * 60 * 60,
        producer,
        enrich_provider_payload(
            {
            "configured": True,
            "active": False,
            "message": "API-FOOTBALL status is unavailable; cached WC26 data is being used.",
            }
        ),
    ))


def stat_number(row, *names):
    for name in names:
        value = row.get(name)
        if value is None or value == "":
            continue
        if isinstance(value, bool):
            return int(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0


def stat_bool(row, *names):
    for name in names:
        if name not in row:
            continue
        value = row.get(name)
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value > 0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y"}
    return False


def fpl_points_for_stat(row, position):
    override = row.get("fantasy_points_override")
    if override is None:
        override = row.get("manual_points")
    if override is not None and override != "":
        try:
            return int(float(override))
        except (TypeError, ValueError):
            pass

    rules = current_scoring_rules()
    minutes = int(stat_number(row, "minutes", "minutes_played", "mins"))
    goals = stat_number(row, "goals", "goals_scored")
    assists = stat_number(row, "assists")
    saves = stat_number(row, "saves", "shots_saved")
    penalty_saves = stat_number(row, "penalty_saves", "penalties_saved")
    penalty_misses = stat_number(row, "penalty_misses", "penalties_missed")
    goals_conceded = stat_number(row, "goals_conceded")
    yellow_cards = stat_number(row, "yellow_cards", "yellows")
    red_cards = stat_number(row, "red_cards", "reds")
    own_goals = stat_number(row, "own_goals")
    clean_sheets = stat_number(row, "clean_sheets")
    clean_sheet = stat_bool(row, "clean_sheet")

    points = 0
    if minutes > 0:
        points += int(rules["appearance_60_plus"]) if minutes >= 60 else int(rules["appearance_under_60"])
    points += goals * int((rules.get("goal_points") or {}).get(position, 0))
    points += assists * int(rules.get("assist", 3))
    if position in {"GK", "DEF", "MID"}:
        clean_sheet_points = int((rules.get("clean_sheet_points") or {}).get(position, 0))
        points += clean_sheets * clean_sheet_points
        if clean_sheet and minutes >= 60 and clean_sheets == 0:
            points += clean_sheet_points
    if position == "GK":
        save_block = max(1, int(rules.get("save_block", 3) or 3))
        points += int(saves // save_block) * int(rules.get("save_points", 1))
        points += penalty_saves * int(rules.get("penalty_save", 5))
    if position in {"GK", "DEF"}:
        conceded_block = max(1, int(rules.get("goals_conceded_block", 2) or 2))
        points += int(goals_conceded // conceded_block) * int(rules.get("goals_conceded_penalty", -1))
    points += penalty_misses * int(rules.get("penalty_miss", -2))
    points += yellow_cards * int(rules.get("yellow_card", -1))
    points += red_cards * int(rules.get("red_card", -3))
    points += own_goals * int(rules.get("own_goal", -2))
    return int(points)


def fpl_points_by_player():
    players = player_map()
    rows = get_match_player_stats()
    points = {
        player_id: 0 if rows else int(player.get("total_fantasy_points") or 0)
        for player_id, player in players.items()
    }
    played = {player_id: points[player_id] != 0 for player_id in players}
    for row in rows:
        player_id = row.get("player_id")
        player = players.get(player_id)
        if not player:
            continue
        points[player_id] = points.get(player_id, 0) + fpl_points_for_stat(row, player.get("position"))
        if stat_number(row, "minutes", "minutes_played", "mins") > 0 or stat_bool(row, "played", "appearance"):
            played[player_id] = True
    return points, played


def extract_bearer_token(handler):
    header = handler.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    return None


def auth_user_from_token(token):
    if not token:
        return None
    status, payload = request_json(supabase_auth_url("user"), headers=supabase_headers(token))
    if status != 200:
        return None
    return payload


def profile_defaults(user):
    email = user.get("email") or ""
    meta = user.get("user_metadata") or {}
    display_name = (meta.get("display_name") or meta.get("full_name") or email.split("@")[0] or "Player").strip()
    display_name = display_name[:24] or "Player"
    return {
        "id": user["id"],
        "email": email,
        "display_name": display_name,
        "supported_nation_code": meta.get("supported_nation_code") or "",
        "time_zone": meta.get("time_zone") or DEFAULT_TIME_ZONE,
        "fantasy_points": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def ensure_profile(user):
    profiles = load_store(PROFILE_STORE, {})
    profile = profiles.get(user["id"])
    if not profile:
        profile = profile_defaults(user)
        profiles[user["id"]] = profile
        save_store(PROFILE_STORE, profiles)
        return profile

    changed = False
    if not profile.get("email") and user.get("email"):
        profile["email"] = user.get("email")
        changed = True
    if not profile.get("display_name"):
        profile["display_name"] = profile_defaults(user)["display_name"]
        changed = True
    if not profile.get("time_zone"):
        profile["time_zone"] = DEFAULT_TIME_ZONE
        changed = True
    if changed:
        profile["updated_at"] = now_iso()
        profiles[user["id"]] = profile
        save_store(PROFILE_STORE, profiles)
    return profile


def update_profile(user_id, updates):
    profiles = load_store(PROFILE_STORE, {})
    profile = profiles.get(user_id, {"id": user_id, "created_at": now_iso()})
    profile.update(updates)
    profile["updated_at"] = now_iso()
    profiles[user_id] = profile
    save_store(PROFILE_STORE, profiles)
    return profile


def get_notifications(user_id):
    notifications = load_store(NOTIFICATION_STORE, {})
    return notifications.get(user_id, [])


def push_notification(user_id, category, title, body):
    notifications = load_store(NOTIFICATION_STORE, {})
    feed = notifications.get(user_id, [])
    feed.insert(
        0,
        {
            "id": uuid.uuid4().hex,
            "category": category,
            "title": title,
            "body": body,
            "created_at": now_iso(),
        },
    )
    notifications[user_id] = feed[:50]
    save_store(NOTIFICATION_STORE, notifications)


def team_default():
    return {
        "team_name": "",
        "player_ids": [],
        "manager_id": "",
        "captain_id": "",
        "vice_captain_id": "",
        "starters": [],
        "bench": [],
        "saved_at": None,
        "projected_points": 0,
        "budget_spent": 0.0,
    }


def compute_team_metrics(team):
    players = player_map()
    managers = manager_map()
    selected_players = [players[player_id] for player_id in team.get("player_ids", []) if player_id in players]
    selected_manager = managers.get(team.get("manager_id"))
    spent = sum(float(player.get("price_millions") or 0) for player in selected_players)
    if selected_manager:
        spent += float(selected_manager.get("price_millions") or 0)

    player_points, played = fpl_points_by_player()
    captain_id = team.get("captain_id")
    vice_id = team.get("vice_captain_id")
    multiplier_id = captain_id if played.get(captain_id, False) else vice_id
    total = 0
    starter_ids = set(item if isinstance(item, str) else item.get("id") for item in team.get("starters", []))
    if not starter_ids:
        starter_ids = set(player["id"] for player in selected_players[:11])

    for player in selected_players:
        if player["id"] not in starter_ids:
            continue
        points = int(player_points.get(player["id"], 0))
        if player["id"] == multiplier_id:
            points *= 2
        total += points

    return {"budget_spent": round(spent, 1), "projected_points": int(total)}


def validate_team_payload(payload):
    players = player_map()
    managers = manager_map()
    player_ids = payload.get("player_ids") or []
    manager_id = payload.get("manager_id") or ""
    starters = payload.get("starters") or []
    bench = payload.get("bench") or []

    if not isinstance(player_ids, list) or len(player_ids) != 15:
        return False, "A Fantasy XI squad must contain exactly 15 players."
    if len(set(player_ids)) != 15:
        return False, "Duplicate players are not allowed."
    if any(player_id not in players for player_id in player_ids):
        return False, "One or more selected players are unavailable."
    if manager_id and manager_id not in managers:
        return False, "Selected manager is unavailable."

    position_counts = {position: 0 for position in SQUAD_LIMITS}
    for player_id in player_ids:
        position = players[player_id].get("position")
        if position not in position_counts:
            return False, "Unsupported player position."
        position_counts[position] += 1
    if position_counts != SQUAD_LIMITS:
        return False, "Squad shape must be 2 GK, 5 DEF, 5 MID and 3 FWD."

    ordered_starters = starters if isinstance(starters, list) else []
    ordered_bench = bench if isinstance(bench, list) else []
    if ordered_starters and len(ordered_starters) != 11:
        return False, "Starting XI must contain 11 players."
    if ordered_bench and len(ordered_bench) != 4:
        return False, "Bench must contain 4 players."

    starter_ids = ordered_starters or player_ids[:11]
    if len(set(starter_ids)) != 11 or any(player_id not in player_ids for player_id in starter_ids):
        return False, "Starting XI is invalid."

    starter_counts = {position: 0 for position in STARTER_LIMITS}
    for player_id in starter_ids:
        starter_counts[players[player_id]["position"]] += 1
    if starter_counts["GK"] != 1 or starter_counts["DEF"] < 3 or starter_counts["MID"] < 2 or starter_counts["FWD"] < 1:
        return False, "Starting XI must include 1 GK, at least 3 DEF, 2 MID and 1 FWD."

    total_budget = sum(float(players[player_id]["price_millions"] or 0) for player_id in player_ids)
    if manager_id:
        total_budget += float(managers[manager_id]["price_millions"] or 0)
    if total_budget > 130:
        return False, "This squad exceeds the £130.0 budget."

    return True, None


def save_fantasy_team(user_id, payload):
    valid, error = validate_team_payload(payload)
    if not valid:
        return None, error

    teams = load_store(FANTASY_STORE, {})
    team = {
        "team_name": (payload.get("team_name") or "").strip()[:32],
        "player_ids": list(payload.get("player_ids") or []),
        "manager_id": payload.get("manager_id") or "",
        "captain_id": payload.get("captain_id") or "",
        "vice_captain_id": payload.get("vice_captain_id") or "",
        "starters": list(payload.get("starters") or payload.get("player_ids", [])[:11]),
        "bench": list(payload.get("bench") or payload.get("player_ids", [])[11:15]),
        "saved_at": now_iso(),
    }
    team.update(compute_team_metrics(team))
    teams[user_id] = team
    save_store(FANTASY_STORE, teams)

    profile = update_profile(user_id, {"fantasy_points": team["projected_points"]})
    push_notification(
        user_id,
        "fantasy",
        "Fantasy XI saved",
        f"{team['team_name'] or 'Your squad'} is locked in at {team['projected_points']} points.",
    )
    return {"team": team, "profile": profile}, None


def fixture_day_key(value):
    if not value:
        return None
    try:
        return iso_to_datetime(value).astimezone(LOCAL_TZ).date().isoformat()
    except Exception:
        return str(value)[:10] or None


def row_fixture_id(row):
    fixture = row.get("fixture")
    if isinstance(fixture, dict):
        return fixture.get("id")
    return row.get("fixture_id") or row.get("fixtureId") or fixture


def fixture_day_index():
    index = {}
    for fixture in get_fixtures():
        key = fixture_day_key(fixture.get("kickoff_at"))
        if not key:
            continue
        index[str(fixture.get("id"))] = key
    return index


def player_points_by_day():
    players = player_map()
    rows = get_match_player_stats()
    fixtures = fixture_day_index()
    points_by_day = {}
    played_by_day = {}

    for row in rows:
        player_id = str(row.get("player_id") or row.get("player") or "")
        if not player_id or player_id not in players:
            continue
        fixture_id = row_fixture_id(row)
        day = fixtures.get(str(fixture_id))
        if not day:
            day = fixture_day_key(row.get("date") or row.get("fixture_date") or row.get("match_date"))
        if not day:
            continue
        points_by_day.setdefault(day, {})
        played_by_day.setdefault(day, set())
        points_by_day[day][player_id] = points_by_day[day].get(player_id, 0) + fpl_points_for_stat(row, players[player_id].get("position"))
        if stat_number(row, "minutes", "minutes_played", "mins") > 0 or stat_bool(row, "played", "appearance"):
            played_by_day[day].add(player_id)

    return points_by_day, played_by_day


def team_points_for_day(team, day, points_by_day=None, played_by_day=None):
    players = player_map()
    points_by_day = points_by_day or {}
    played_by_day = played_by_day or {}
    selected_players = [players[player_id] for player_id in team.get("player_ids", []) if player_id in players]
    starter_ids = set(item if isinstance(item, str) else item.get("id") for item in team.get("starters", []))
    if not starter_ids:
        starter_ids = set(player["id"] for player in selected_players[:11])
    daily_points = points_by_day.get(day, {})
    daily_played = played_by_day.get(day, set())

    captain_id = team.get("captain_id")
    vice_id = team.get("vice_captain_id")
    multiplier_id = None
    if captain_id in daily_played:
        multiplier_id = captain_id
    elif vice_id in daily_played:
        multiplier_id = vice_id

    total = 0
    for player in selected_players:
        if player["id"] not in starter_ids:
            continue
        points = int(daily_points.get(player["id"], 0))
        if player["id"] == multiplier_id:
            points *= 2
        total += points
    return int(total)


def build_league_daily_scores(league):
    profiles = load_store(PROFILE_STORE, {})
    teams = load_store(FANTASY_STORE, {})
    dates = sorted(set(fixture_day_index().values()))
    points_by_day, played_by_day = player_points_by_day()
    awards = {member_id: 0 for member_id in league.get("member_ids", [])}
    breakdown = []

    for day in dates:
        results = []
        for member_id in league.get("member_ids", []):
            team = teams.get(member_id)
            if not team:
                continue
            score = team_points_for_day(team, day, points_by_day, played_by_day)
            results.append(
                {
                    "user_id": member_id,
                    "display_name": profiles.get(member_id, {}).get("display_name") or "Player",
                    "score": score,
                    "team_name": team.get("team_name") or "Your squad",
                }
            )
        results.sort(key=lambda item: (-item["score"], item["display_name"].lower(), item["user_id"]))
        if not results or results[0]["score"] <= 0:
            continue
        awards[results[0]["user_id"]] = awards.get(results[0]["user_id"], 0) + 3
        if len(results) > 1 and results[1]["score"] > 0:
            awards[results[1]["user_id"]] = awards.get(results[1]["user_id"], 0) + 1
        breakdown.append(
            {
                "date": day,
                "leaders": results[:2],
            }
        )

    store = load_store(LEAGUE_DAILY_POINTS_STORE, {})
    store[league["id"]] = {
        "league_id": league["id"],
        "updated_at": now_iso(),
        "awards": awards,
        "breakdown": breakdown,
    }
    save_store(LEAGUE_DAILY_POINTS_STORE, store)
    return awards, breakdown


def recompute_all_league_daily_scores():
    leagues = load_store(LEAGUE_STORE, [])
    updated = []
    for league in leagues:
        awards, breakdown = build_league_daily_scores(league)
        updated.append(
            {
                "league_id": league["id"],
                "name": league.get("name"),
                "members": len(league.get("member_ids", [])),
                "award_rows": len(awards),
                "days": len(breakdown),
            }
        )
    record_api_activity("local/league-daily-recompute", "admin", {"x-admin-action": "true"}, scope="admin")
    return updated


def refresh_all_fantasy_state():
    teams = load_store(FANTASY_STORE, {})
    profiles = load_store(PROFILE_STORE, {})
    for user_id, team in teams.items():
        refreshed = dict(team)
        refreshed.update(compute_team_metrics(team))
        teams[user_id] = refreshed
        if user_id in profiles:
            profiles[user_id]["fantasy_points"] = refreshed.get("projected_points", 0)
            profiles[user_id]["updated_at"] = now_iso()
    save_store(FANTASY_STORE, teams)
    save_store(PROFILE_STORE, profiles)
    return {
        "teams": len(teams),
        "profiles": len(profiles),
        "leagues": len(recompute_all_league_daily_scores()),
    }


def get_fantasy_team(user_id):
    teams = load_store(FANTASY_STORE, {})
    return teams.get(user_id, team_default())


def league_default(name, owner_id):
    return {
        "id": uuid.uuid4().hex,
        "name": name[:40],
        "invite_code": uuid.uuid4().hex[:6].upper(),
        "owner_id": owner_id,
        "competition": "fantasy",
        "member_ids": [owner_id],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def build_global_rows():
    profiles = load_store(PROFILE_STORE, {})
    rows = list(profiles.values())
    rows.sort(key=lambda item: (-int(item.get("fantasy_points") or 0), item.get("display_name") or "", item.get("id")))
    return rows


def rank_for_user(user_id):
    rows = build_global_rows()
    for index, row in enumerate(rows, start=1):
        if row["id"] == user_id:
            return {"rank": index, "points": int(row.get("fantasy_points") or 0), "total": len(rows)}
    return {"rank": None, "points": 0, "total": len(rows)}


def build_league_payload_for_user(user_id):
    leagues = load_store(LEAGUE_STORE, [])
    profiles = load_store(PROFILE_STORE, {})
    teams = load_store(FANTASY_STORE, {})
    result = []
    for league in leagues:
        if user_id not in league.get("member_ids", []):
            continue
        members = [profiles[member_id] for member_id in league.get("member_ids", []) if member_id in profiles]
        awards, breakdown = build_league_daily_scores(league)
        enriched_members = []
        for member in members:
            member_id = member["id"]
            team = teams.get(member_id, team_default())
            league_points = int(awards.get(member_id, 0))
            enriched_members.append(
                {
                    **member,
                    "league_points": league_points,
                    "league_team_points": team.get("projected_points", 0),
                    "league_team_name": team.get("team_name") or "Your squad",
                }
            )
        enriched_members.sort(
            key=lambda item: (
                -int(item.get("league_points") or 0),
                -int(item.get("league_team_points") or 0),
                item.get("display_name") or "",
                item.get("id"),
            )
        )
        position = None
        for index, member in enumerate(enriched_members, start=1):
            if member["id"] == user_id:
                position = {
                    "rank": index,
                    "points": int(member.get("league_points") or 0),
                    "total": len(enriched_members),
                }
                break
        result.append(
            {
                **league,
                "members": enriched_members,
                "position": position,
                "scoring": {
                    "type": "daily",
                    "awards": {"first": 3, "second": 1, "rest": 0},
                    "timezone": DEFAULT_TIME_ZONE,
                    "breakdown": breakdown[:30],
                },
            }
        )
    result.sort(key=lambda item: item["name"].lower())
    return result


def create_league(user_id, name):
    label = (name or "").strip()
    if len(label) < 2:
        return None, "League name must be at least 2 characters."
    leagues = load_store(LEAGUE_STORE, [])
    league = league_default(label, user_id)
    leagues.append(league)
    save_store(LEAGUE_STORE, leagues)
    push_notification(user_id, "league", "League created", f"{label} is ready. Share code {league['invite_code']}.")
    return league, None


def join_league(user_id, invite_code):
    code = (invite_code or "").strip().upper()
    if len(code) != 6:
        return None, "Invite code must be 6 characters."
    leagues = load_store(LEAGUE_STORE, [])
    for league in leagues:
        if league.get("invite_code") != code:
            continue
        if user_id not in league["member_ids"]:
            league["member_ids"].append(user_id)
            league["updated_at"] = now_iso()
            save_store(LEAGUE_STORE, leagues)
            push_notification(user_id, "league", "Joined league", f"You joined {league['name']}.")
        return league, None
    return None, "League not found."


def leave_league(user_id, league_id):
    leagues = load_store(LEAGUE_STORE, [])
    updated = []
    left_name = None
    for league in leagues:
        if league.get("id") != league_id:
            updated.append(league)
            continue
        members = [member_id for member_id in league.get("member_ids", []) if member_id != user_id]
        if not members:
            continue
        league["member_ids"] = members
        if league.get("owner_id") == user_id:
            league["owner_id"] = members[0]
        league["updated_at"] = now_iso()
        updated.append(league)
        left_name = league["name"]
    save_store(LEAGUE_STORE, updated)
    if left_name:
        push_notification(user_id, "league", "Left league", f"You left {left_name}.")
    return {"ok": True}


def delete_league(user_id, league_id):
    leagues = load_store(LEAGUE_STORE, [])
    updated = []
    deleted_name = None
    for league in leagues:
        if league.get("id") == league_id and league.get("owner_id") == user_id:
            deleted_name = league.get("name")
            continue
        updated.append(league)
    save_store(LEAGUE_STORE, updated)
    if deleted_name:
        push_notification(user_id, "league", "League removed", f"{deleted_name} has been deleted.")
    return {"ok": True}


def support_messages_for_user(user_id):
    messages = load_store(SUPPORT_STORE, [])
    return [message for message in messages if message.get("user_id") == user_id]


def clear_support_request(request_id):
    request_id = (request_id or "").strip()
    if not request_id:
        return False
    support_messages = load_store(SUPPORT_STORE, [])
    remaining = [item for item in support_messages if item.get("id") != request_id]
    if len(remaining) == len(support_messages):
        return False
    save_store(SUPPORT_STORE, remaining)
    record_api_activity("local/support-clear", "admin", {"x-admin-action": "true"}, {"request_id": request_id}, scope="admin")
    return True


def save_support_message(user, subject, message):
    subject = (subject or "").strip()[:80]
    message = (message or "").strip()
    if len(message) < 10:
        return None, "Please include a little more detail."
    support_messages = load_store(SUPPORT_STORE, [])
    entry = {
        "id": uuid.uuid4().hex,
        "user_id": user["id"],
        "email": user.get("email") or "",
        "subject": subject or "Support request",
        "message": message,
        "created_at": now_iso(),
    }
    support_messages.insert(0, entry)
    save_store(SUPPORT_STORE, support_messages)
    push_notification(user["id"], "support", "Support request sent", "Thanks. Your request has been queued for review.")
    return entry, None


def delete_local_account_data(user_id):
    profiles = load_store(PROFILE_STORE, {})
    profiles.pop(user_id, None)
    save_store(PROFILE_STORE, profiles)

    teams = load_store(FANTASY_STORE, {})
    teams.pop(user_id, None)
    save_store(FANTASY_STORE, teams)

    notifications = load_store(NOTIFICATION_STORE, {})
    notifications.pop(user_id, None)
    save_store(NOTIFICATION_STORE, notifications)

    support_messages = load_store(SUPPORT_STORE, [])
    support_messages = [message for message in support_messages if message.get("user_id") != user_id]
    save_store(SUPPORT_STORE, support_messages)

    leagues = load_store(LEAGUE_STORE, [])
    filtered = []
    for league in leagues:
        members = [member_id for member_id in league.get("member_ids", []) if member_id != user_id]
        if not members:
            continue
        league["member_ids"] = members
        if league.get("owner_id") == user_id:
            league["owner_id"] = members[0]
        filtered.append(league)
    save_store(LEAGUE_STORE, filtered)


def fantasy_catalog():
    nations = nation_map()
    player_points, played = fpl_points_by_player()
    players = []
    for player in get_players():
        nation = nations.get(player.get("nation_code"))
        if not nation or player.get("withdrawn"):
            continue
        players.append(
            {
                "id": player["id"],
                "name": player.get("name"),
                "first_name": player.get("first_name"),
                "last_name": player.get("last_name"),
                "position": player.get("position"),
                "club": player.get("club"),
                "nation": nation,
                "price": float(player.get("price_millions") or 0),
                "caps": int(player.get("caps") or 0),
                "goals": int(player.get("international_goals") or 0),
                "star_rating": int(player.get("star_rating") or 0),
                "recent_form": float(player.get("recent_form") or 0),
                "total_fantasy_points": int(player.get("total_fantasy_points") or 0),
                "fpl_points": int(player_points.get(player["id"], 0)),
                "fpl_played": bool(played.get(player["id"], False)),
                "injured": bool(player.get("injured")),
                "suspended": bool(player.get("suspended")),
            }
        )
    return players


def manager_catalog():
    nations = nation_map()
    managers = []
    for manager in get_managers():
        nation = nations.get(manager.get("nation_code"))
        managers.append(
            {
                "id": manager["id"],
                "name": manager.get("name"),
                "nation": nation,
                "price": float(manager.get("price_millions") or 0),
                "nationality_code": manager.get("nationality_code"),
            }
        )
    return managers


def standings_payload():
    groups = build_group_tables()
    thirds = build_best_thirds(groups)
    nations_by_code = nation_map()
    fixtures = get_fixtures()
    enriched_fixtures = []
    for fixture in fixtures:
        item = dict(fixture)
        item["home_nation"] = nations_by_code.get(fixture.get("home_nation_code"))
        item["away_nation"] = nations_by_code.get(fixture.get("away_nation_code"))
        enriched_fixtures.append(item)
    return {
        "groups": groups,
        "thirds": thirds,
        "bracket": build_bracket(),
        "fixtures": enriched_fixtures,
        "playerStats": player_stat_leaders(),
        "goalEvents": get_match_goal_events(),
    }


def auth_session_payload(token):
    user = auth_user_from_token(token)
    if not user:
        return None
    profile = ensure_profile(user)
    return {
        "user": {
            "id": user["id"],
            "email": user.get("email"),
        },
        "profile": profile,
        "fantasyTeam": get_fantasy_team(user["id"]),
        "notifications": get_notifications(user["id"]),
        "leaderboard": {
            "global": build_global_rows()[:50],
            "position": rank_for_user(user["id"]),
            "leagues": build_league_payload_for_user(user["id"]),
        },
    }


def auth_required(handler):
    token = extract_bearer_token(handler)
    user = auth_user_from_token(token)
    if not user:
        error_response(handler, "Authentication required.", HTTPStatus.UNAUTHORIZED)
        return None, None
    return token, user


def admin_credentials():
    return {
        "email": os.getenv("ADMIN_EMAIL", "admin@wc26.local").strip().lower(),
        "password": os.getenv("ADMIN_PASSWORD", "admin123").strip(),
    }


def prune_admin_sessions(sessions):
    now = time.time()
    return {
        token: session
        for token, session in (sessions or {}).items()
        if float(session.get("expires_at", 0) or 0) > now
    }


def create_admin_session(email):
    sessions = prune_admin_sessions(load_store(ADMIN_SESSIONS_STORE, {}))
    token = uuid.uuid4().hex + uuid.uuid4().hex
    sessions[token] = {
        "email": email,
        "created_at": now_iso(),
        "expires_at": time.time() + 12 * 60 * 60,
    }
    save_store(ADMIN_SESSIONS_STORE, sessions)
    return token


def admin_session_from_token(token):
    if not token:
        return None
    stored_sessions = load_store(ADMIN_SESSIONS_STORE, {})
    sessions = prune_admin_sessions(stored_sessions)
    if len(sessions) != len(stored_sessions):
        save_store(ADMIN_SESSIONS_STORE, sessions)
    return sessions.get(token)


def admin_auth_required(handler):
    token = handler.headers.get("X-Admin-Token", "").strip()
    session = admin_session_from_token(token)
    if not session:
        error_response(handler, "Admin authentication required.", HTTPStatus.UNAUTHORIZED)
        return None
    return session


def editor_reference_payload(kind):
    suppliers = {
        "fixtures": get_fixtures_reference,
        "players": get_players_reference,
        "managers": get_managers_reference,
        "goalEvents": get_match_goal_events_reference,
        "matchPlayerStats": get_match_player_stats_reference,
        "scoringRules": scoring_rules_default,
    }
    supplier = suppliers.get(kind)
    return supplier() if supplier else None


def editor_current_payload(kind):
    suppliers = {
        "fixtures": get_fixtures,
        "players": get_players,
        "managers": get_managers,
        "goalEvents": get_match_goal_events,
        "matchPlayerStats": get_match_player_stats,
        "scoringRules": current_scoring_rules,
    }
    supplier = suppliers.get(kind)
    return supplier() if supplier else None


def editor_source_flags():
    return {
        "fixtures": "local" if store_has_local_rows(EDITABLE_FIXTURES_STORE) else "reference",
        "players": "local" if store_has_local_rows(EDITABLE_PLAYERS_STORE) else "reference",
        "managers": "local" if store_has_local_rows(EDITABLE_MANAGERS_STORE) else "reference",
        "goalEvents": "local" if store_has_local_rows(EDITABLE_GOAL_EVENTS_STORE) else "reference",
        "matchPlayerStats": "local" if store_has_local_rows(EDITABLE_MATCH_PLAYER_STATS_STORE) else "reference",
        "scoringRules": "local" if load_store(SCORING_RULES_STORE, {}) else "default",
    }


def validate_editor_payload(kind, payload):
    if kind == "scoringRules":
        if not isinstance(payload, dict):
            return None, "Scoring rules must be a JSON object."
        merged = scoring_rules_default()
        for key in [
            "appearance_under_60",
            "appearance_60_plus",
            "assist",
            "save_block",
            "save_points",
            "penalty_save",
            "goals_conceded_block",
            "goals_conceded_penalty",
            "penalty_miss",
            "yellow_card",
            "red_card",
            "own_goal",
        ]:
            if key in payload:
                merged[key] = int(payload.get(key) or 0)
        for key in ["goal_points", "clean_sheet_points", "league_awards"]:
            if key in payload:
                if not isinstance(payload[key], dict):
                    return None, f"{key} must be an object."
                merged[key].update(payload[key])
        return merged, None

    if not isinstance(payload, list):
        return None, f"{kind} must be a JSON array."
    normalized = []
    for index, row in enumerate(payload, start=1):
        if not isinstance(row, dict):
            return None, f"{kind} row {index} must be an object."
        item = dict(row)
        if not item.get("id"):
            item["id"] = uuid.uuid4().hex
        normalized.append(item)
    return normalized, None


def save_editor_payload(kind, payload):
    store_path = EDITOR_KIND_CONFIG.get(kind)
    if not store_path:
        return None, "Unknown editor kind."
    normalized, error = validate_editor_payload(kind, payload)
    if error:
        return None, error
    save_store(store_path, normalized)
    if kind in {"fixtures", "players", "managers", "goalEvents", "matchPlayerStats", "scoringRules"}:
        refreshed = refresh_all_fantasy_state()
    else:
        refreshed = None
    return {"saved": kind, "refresh": refreshed}, None


def import_editor_payload(kind):
    payload = editor_reference_payload(kind)
    if payload is None:
        return None, "Unknown editor kind."
    return save_editor_payload(kind, payload)


def reset_editor_payload(kind):
    store_path = EDITOR_KIND_CONFIG.get(kind)
    if not store_path:
        return None, "Unknown editor kind."
    empty = {} if kind == "scoringRules" else []
    save_store(store_path, empty)
    refreshed = refresh_all_fantasy_state()
    return {"reset": kind, "refresh": refreshed}


def admin_dashboard_payload():
    profiles = load_store(PROFILE_STORE, {})
    teams = load_store(FANTASY_STORE, {})
    leagues = load_store(LEAGUE_STORE, [])
    support_messages = load_store(SUPPORT_STORE, [])
    sync_logs = load_store(API_SYNC_LOGS_STORE, [])
    raw_responses = load_store(RAW_API_RESPONSES_STORE, [])
    return {
        "provider": get_provider_status(),
        "usage": read_api_usage_state(),
        "counts": {
            "users": len(profiles),
            "teams": len(teams),
            "leagues": len(leagues),
            "support": len(support_messages),
        },
        "recentSyncs": sync_logs[:12],
        "recentResponses": [
            {
                "id": item.get("id"),
                "endpoint": item.get("endpoint"),
                "status": item.get("status"),
                "recorded_at": item.get("recorded_at"),
                "scope": item.get("scope"),
            }
            for item in raw_responses[:8]
        ],
        "support": support_messages[:12],
        "leagueDailyPoints": load_store(LEAGUE_DAILY_POINTS_STORE, {}),
        "editor": {
            "sources": editor_source_flags(),
            "fixtures": get_fixtures(),
            "players": get_players(),
            "managers": get_managers(),
            "goalEvents": get_match_goal_events(),
            "matchPlayerStats": get_match_player_stats(),
            "scoringRules": current_scoring_rules(),
        },
    }


class WC26Handler(SimpleHTTPRequestHandler):
    server_version = "WC26/2.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            return json_response(self, {"ok": True, "generatedAt": now_iso()})
        if path == "/api/provider":
            return json_response(self, get_provider_status())
        if path == "/api/admin/me":
            session = admin_auth_required(self)
            if not session:
                return
            return json_response(self, {"email": session.get("email")})
        if path == "/api/admin/dashboard":
            if not admin_auth_required(self):
                return
            return json_response(self, admin_dashboard_payload())
        if path == "/api/nations":
            return json_response(self, get_nations())
        if path == "/api/fixtures":
            return json_response(self, get_fixtures())
        if path == "/api/coming-up":
            return json_response(self, next_coming_up())
        if path == "/api/standings":
            return json_response(self, standings_payload())
        if path == "/api/fantasy/players":
            return json_response(self, fantasy_catalog())
        if path == "/api/fantasy/managers":
            return json_response(self, manager_catalog())
        if path == "/api/help/faqs":
            return json_response(
                self,
                [
                    {
                        "question": "How does Fantasy XI scoring work here?",
                        "answer": "Fantasy XI uses FPL-style scoring for minutes, goals, assists, clean sheets, saves and card deductions. Bonus points and defensive contribution points are excluded.",
                    },
                    {
                        "question": "Can I join private leagues?",
                        "answer": "Yes. Create a fantasy league, copy the invite code and share it with your group.",
                    },
                    {
                        "question": "Where can I get help?",
                        "answer": "Use Contact support from your profile. Requests are saved locally so staff can review them from admin.",
                    },
                ],
            )
        if path == "/api/auth/me":
            token = extract_bearer_token(self)
            payload = auth_session_payload(token)
            if not payload:
                return error_response(self, "Session expired.", HTTPStatus.UNAUTHORIZED)
            return json_response(self, payload)
        if path == "/api/profile":
            _, user = auth_required(self)
            if not user:
                return
            return json_response(self, ensure_profile(user))
        if path == "/api/fantasy/team":
            _, user = auth_required(self)
            if not user:
                return
            return json_response(self, get_fantasy_team(user["id"]))
        if path == "/api/leaderboard":
            token = extract_bearer_token(self)
            session = auth_session_payload(token)
            if session:
                return json_response(self, session["leaderboard"])
            return json_response(self, {"global": build_global_rows()[:50], "position": None, "leagues": []})
        if path == "/api/support/messages":
            _, user = auth_required(self)
            if not user:
                return
            return json_response(self, support_messages_for_user(user["id"]))

        if path.startswith("/api/"):
            return error_response(self, "Unknown endpoint.", HTTPStatus.NOT_FOUND)

        target = PUBLIC_DIR / path.lstrip("/")
        if path != "/" and not target.exists():
            self.path = "/"
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            payload = read_body_json(self)
        except ValueError as exc:
            return error_response(self, str(exc))

        if path == "/api/admin/login":
            email = (payload.get("email") or "").strip().lower()
            password = payload.get("password") or ""
            credentials = admin_credentials()
            if email != credentials["email"] or password != credentials["password"]:
                return error_response(self, "Invalid admin credentials.", HTTPStatus.UNAUTHORIZED)
            token = create_admin_session(email)
            return json_response(self, {"token": token, "admin": {"email": email}})

        if path == "/api/admin/logout":
            token = self.headers.get("X-Admin-Token", "").strip()
            sessions = load_store(ADMIN_SESSIONS_STORE, {})
            sessions.pop(token, None)
            save_store(ADMIN_SESSIONS_STORE, sessions)
            return json_response(self, {"ok": True})

        if path == "/api/admin/provider/refresh":
            if not admin_auth_required(self):
                return
            cache_path = CACHE_DIR / "api_football_status.json"
            if cache_path.exists():
                cache_path.unlink()
            return json_response(self, admin_dashboard_payload())

        if path == "/api/admin/quota/reset":
            if not admin_auth_required(self):
                return
            reset_local_api_usage_state()
            return json_response(self, admin_dashboard_payload())

        if path == "/api/admin/scoring/recompute":
            if not admin_auth_required(self):
                return
            updated = recompute_all_league_daily_scores()
            payload = admin_dashboard_payload()
            payload["recomputedLeagues"] = updated
            return json_response(self, payload)

        if path == "/api/admin/support/clear":
            if not admin_auth_required(self):
                return
            if not clear_support_request(payload.get("id")):
                return error_response(self, "Support request not found.", HTTPStatus.NOT_FOUND)
            return json_response(self, admin_dashboard_payload())

        if path == "/api/admin/editor/import":
            if not admin_auth_required(self):
                return
            result, error = import_editor_payload(payload.get("kind"))
            if error:
                return error_response(self, error)
            response = admin_dashboard_payload()
            response["editorAction"] = result
            return json_response(self, response)

        if path == "/api/admin/editor/reset":
            if not admin_auth_required(self):
                return
            result = reset_editor_payload(payload.get("kind"))
            if not result:
                return error_response(self, "Unknown editor kind.")
            response = admin_dashboard_payload()
            response["editorAction"] = result
            return json_response(self, response)

        if path == "/api/admin/editor/save":
            if not admin_auth_required(self):
                return
            result, error = save_editor_payload(payload.get("kind"), payload.get("payload"))
            if error:
                return error_response(self, error)
            response = admin_dashboard_payload()
            response["editorAction"] = result
            return json_response(self, response)

        if path == "/api/auth/signin":
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            status, result = request_json(
                supabase_auth_url("token?grant_type=password"),
                method="POST",
                headers=supabase_headers(),
                payload={"email": email, "password": password},
            )
            if status != 200:
                message = result.get("msg") or result.get("error_description") or result.get("message") or "Sign in failed."
                return error_response(self, message, HTTPStatus.UNAUTHORIZED)
            token = result.get("access_token")
            user = auth_user_from_token(token)
            profile = ensure_profile(user) if user else None
            return json_response(
                self,
                {
                    "access_token": token,
                    "refresh_token": result.get("refresh_token"),
                    "user": user,
                    "profile": profile,
                },
            )

        if path == "/api/auth/signup":
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            display_name = (payload.get("display_name") or "").strip()
            if len(display_name) < 2:
                return error_response(self, "Display name must be at least 2 characters.")
            status, result = request_json(
                supabase_auth_url("signup"),
                method="POST",
                headers=supabase_headers(),
                payload={"email": email, "password": password, "data": {"display_name": display_name}},
            )
            if status not in (200, 201):
                message = result.get("msg") or result.get("error_description") or result.get("message") or "Could not create account."
                return error_response(self, message)
            user = result.get("user")
            profile = ensure_profile(user) if user and user.get("id") else None
            session = result.get("session") or {}
            return json_response(
                self,
                {
                    "message": "Account created.",
                    "access_token": session.get("access_token"),
                    "refresh_token": session.get("refresh_token"),
                    "user": user,
                    "profile": profile,
                },
            )

        if path == "/api/auth/recover":
            email = (payload.get("email") or "").strip()
            status, result = request_json(
                supabase_auth_url("recover"),
                method="POST",
                headers=supabase_headers(),
                payload={"email": email},
            )
            if status not in (200, 201):
                message = result.get("error_description") or result.get("message") or "Could not send reset email."
                return error_response(self, message)
            return json_response(self, {"ok": True, "message": "Reset email sent."})

        if path == "/api/profile":
            _, user = auth_required(self)
            if not user:
                return
            current = ensure_profile(user)
            updates = {}
            if "display_name" in payload:
                display_name = (payload.get("display_name") or "").strip()[:24]
                if len(display_name) < 2:
                    return error_response(self, "Display name must be 2-24 characters.")
                updates["display_name"] = display_name
            if "supported_nation_code" in payload:
                updates["supported_nation_code"] = (payload.get("supported_nation_code") or "").strip().upper()
            if "time_zone" in payload:
                updates["time_zone"] = (payload.get("time_zone") or DEFAULT_TIME_ZONE).strip()
            merged = dict(current)
            merged.update(updates)
            profile = update_profile(user["id"], merged)
            return json_response(self, profile)

        if path == "/api/fantasy/team":
            _, user = auth_required(self)
            if not user:
                return
            result, error = save_fantasy_team(user["id"], payload)
            if error:
                return error_response(self, error)
            return json_response(self, result)

        if path == "/api/leagues/create":
            _, user = auth_required(self)
            if not user:
                return
            league, error = create_league(user["id"], payload.get("name"))
            if error:
                return error_response(self, error)
            return json_response(self, league, HTTPStatus.CREATED)

        if path == "/api/leagues/join":
            _, user = auth_required(self)
            if not user:
                return
            league, error = join_league(user["id"], payload.get("invite_code"))
            if error:
                return error_response(self, error, HTTPStatus.NOT_FOUND)
            return json_response(self, league)

        if path == "/api/leagues/leave":
            _, user = auth_required(self)
            if not user:
                return
            return json_response(self, leave_league(user["id"], payload.get("league_id")))

        if path == "/api/leagues/delete":
            _, user = auth_required(self)
            if not user:
                return
            return json_response(self, delete_league(user["id"], payload.get("league_id")))

        if path == "/api/support":
            _, user = auth_required(self)
            if not user:
                return
            entry, error = save_support_message(user, payload.get("subject"), payload.get("message"))
            if error:
                return error_response(self, error)
            return json_response(self, entry, HTTPStatus.CREATED)

        if path == "/api/profile/delete-local":
            _, user = auth_required(self)
            if not user:
                return
            delete_local_account_data(user["id"])
            return json_response(self, {"ok": True})

        return error_response(self, "Unknown endpoint.", HTTPStatus.NOT_FOUND)


def main():
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), WC26Handler)
    print(f"WC26 running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")


if __name__ == "__main__":
    main()
