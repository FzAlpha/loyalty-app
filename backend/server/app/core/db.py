"""Direct Postgres access (plan §1.3).

Each RPC runs in its own transaction, as each PostgREST call did for the Edge Functions, so a rate
limit or a spent recovery code stays committed even when a later step fails.

Identity is set the way PostgREST sets it: `role`, `request.jwt.claims` and `request.headers` as
transaction-local settings. Caller calls run as `authenticated` with the caller's verified claims;
service calls run as `service_role`.
"""
import json
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Iterator, Literal

from .config import settings
from .errors import from_pg

if TYPE_CHECKING:
    import psycopg
    from psycopg import sql
    from psycopg_pool import ConnectionPool

# psycopg is imported on first use, so modules and tests that never touch the database load
# without the libpq driver.
_pool: "ConnectionPool | None" = None


def pool() -> "ConnectionPool":
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool

        s = settings()
        # prepare_threshold=None: no prepared statements, so the Supavisor transaction pooler works.
        _pool = ConnectionPool(
            s.DATABASE_URL, min_size=s.DB_POOL_MIN, max_size=s.DB_POOL_MAX,
            kwargs={"prepare_threshold": None}, open=True,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@dataclass(frozen=True)
class Ctx:
    """Who the database sees. Build with as_user() or as_service()."""
    role: Literal["authenticated", "service_role"]
    claims: dict[str, Any]
    headers: dict[str, str] = field(default_factory=dict)


def as_user(claims: dict[str, Any], headers: dict[str, str]) -> Ctx:
    return Ctx("authenticated", claims, headers)


def as_service(headers: dict[str, str] | None = None) -> Ctx:
    return Ctx("service_role", {"role": "service_role"}, headers or {})


@contextmanager
def _tx(ctx: Ctx) -> "Iterator[psycopg.Connection]":
    with pool().connection() as conn:  # commits on clean exit, rolls back on error
        conn.execute(
            "select set_config('role', %s, true), set_config('request.jwt.claims', %s, true),"
            " set_config('request.headers', %s, true)",
            (ctx.role, json.dumps(ctx.claims), json.dumps(ctx.headers)),
        )
        yield conn


Arg = tuple[str, Any, str]  # (parameter name, value, Postgres type)
Returns = Literal["json", "rows", "void"]


def _call_sql(fn: str, args: list[Arg], returns: Returns) -> "tuple[sql.Composed, list[Any]]":
    from psycopg import sql
    from psycopg.types.json import Jsonb

    params = sql.SQL(", ").join(
        sql.SQL("{} => %s::{}").format(sql.Identifier(name), sql.SQL(pgtype)) for name, _, pgtype in args
    )
    call = sql.SQL("{}.{}({})").format(sql.Identifier("api"), sql.Identifier(fn), params)
    if returns == "rows":
        q = sql.SQL("select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from {} t").format(call)
    elif returns == "json":
        q = sql.SQL("select to_jsonb({})").format(call)
    else:
        q = sql.SQL("select {}").format(call)
    values = [Jsonb(v) if pgtype == "jsonb" and v is not None else v for _, v, pgtype in args]
    return q, values


_TYPES = {"text", "uuid", "integer", "boolean", "inet", "jsonb", "timestamptz"}


def rpc(ctx: Ctx, fn: str, args: list[Arg] | None = None, returns: Returns = "json") -> Any:
    """Calls api.<fn>(name => value, ...). Result is JSON-shaped, as PostgREST would return it."""
    args = args or []
    for _, _, pgtype in args:
        if pgtype not in _TYPES:  # types are spliced into SQL, so only known names are allowed
            raise ValueError(f"unsupported type {pgtype}")
    import psycopg

    q, values = _call_sql(fn, args, returns)
    try:
        with _tx(ctx) as conn:
            row = conn.execute(q, values).fetchone()
    except psycopg.Error as e:
        raise from_pg(e) from e
    return None if returns == "void" or row is None else row[0]


def query_service(q: str) -> list[tuple[Any, ...]]:
    """Fixed read-only query as service_role (used for the error catalogue)."""
    with _tx(as_service()) as conn:
        return conn.execute(q).fetchall()
