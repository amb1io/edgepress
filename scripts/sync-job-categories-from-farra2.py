#!/usr/bin/env python3
"""Sincroniza categorias de jobs pt_BR do farra-2.sql para import-farramedia-edgepress.sql."""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FARRA2_PATH = Path("/Users/rhamses/Sites/farra.media/farra-2.sql")
IMPORT_PATH = ROOT / "drizzle/seed/import-farramedia-edgepress.sql"

CATEGORY_TERM_ID_BY_LEGACY: dict[str, int] = {
    "c1a55c6c-a690-4842-9527-7fb2b252433f": 10,
    "d8457323-6aa9-4a0c-8df5-e9681160a48f": 26,
    "a63ad5b1-2e47-4fd1-a01e-34ffcc912c7c": 20,
    "8936b4a6-cc09-4f17-b0ad-489af05ca22a": 22,
    "af07eb79-35f0-4229-8f61-aaaab4a86f9d": 12,
    "547f3572-9ff3-40e6-9dfb-891fefabe4dd": 24,
    "706087b3-131b-410c-84c4-21c5d79c1f8e": 18,
    "3d742329-e562-48c4-b4e9-4b1b3c3c974d": 16,
    "bb90167a-5cd6-4c7f-9c3c-e42604f4aedf": 14,
}

JOB_CATEGORY_TERM_IDS = sorted(set(CATEGORY_TERM_ID_BY_LEGACY.values()))
TERM_NAMES: dict[int, str] = {
    10: "BRANDED ENTERTAINMENT",
    12: "CINEMA",
    14: "CLIPE",
    16: "CORPORATIVO",
    18: "LIVES E EVENTOS",
    20: "PODCASTS",
    22: "PUBLICIDADE",
    24: "SOCIAL MEDIA",
    26: "TELEVISÃO E STREAMING",
}

RESYNC_START = "-- Resync categorias de jobs pt_BR (farra-2.sql)"
RESYNC_END = "-- Fim resync categorias jobs pt_BR"


def parse_meta(tags_raw: str | None) -> dict:
    if not tags_raw:
        return {}
    arr = json.loads(tags_raw)
    if not arr:
        return {}
    return json.loads(arr[0])


def load_farra2() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(FARRA2_PATH.read_text(encoding="utf-8"))
    return conn


def parse_import_jobs(import_sql: str) -> dict[str, int]:
    legacy_to_post: dict[str, int] = {}
    pattern = re.compile(
        r"INSERT OR REPLACE INTO edp_posts[\s\S]*?VALUES\s*\((\d+),\s*15,[\s\S]*?'published',\s*'(\{[\s\S]*?\})'",
        re.MULTILINE,
    )
    for match in pattern.finditer(import_sql):
        post_id = int(match.group(1))
        raw = match.group(2).replace("''", "'")
        try:
            meta = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if meta.get("posttype") != "jobs":
            continue
        if meta.get("language") not in (None, "ptbr"):
            continue
        legacy_id = meta.get("legacy_id")
        if legacy_id:
            legacy_to_post[legacy_id] = post_id
    return legacy_to_post


def expected_job_categories(conn: sqlite3.Connection) -> dict[str, set[int]]:
    expected: dict[str, set[int]] = {}
    rows = conn.execute(
        """
        SELECT p.id AS legacy_id, p.tags, ctp.categoryId
        FROM posts p
        JOIN categoriesToPosts ctp ON ctp.postId = p.id
        """
    ).fetchall()
    for row in rows:
        meta = parse_meta(row["tags"])
        if meta.get("posttype") != "jobs":
            continue
        if meta.get("language") not in (None, "ptbr"):
            continue
        term_id = CATEGORY_TERM_ID_BY_LEGACY.get(row["categoryId"])
        if term_id:
            expected.setdefault(row["legacy_id"], set()).add(term_id)
    return expected


def build_resync_sql(legacy_to_post: dict[str, int], expected: dict[str, set[int]]) -> str:
    term_id_list = ", ".join(str(t) for t in JOB_CATEGORY_TERM_IDS)
    lines = [
        RESYNC_START,
        "-- Remove vínculos de categorias (categorias) de todos os jobs pt_BR; reinsere conforme farra-2.sql",
        "",
        "DELETE FROM edp_posts_taxonomies",
        f"WHERE term_id IN ({term_id_list})",
        "AND post_id IN (",
        "  SELECT id FROM edp_posts",
        "  WHERE post_type_id = 15",
        "    AND json_extract(meta_values, '$.posttype') = 'jobs'",
        "    AND json_extract(meta_values, '$.language') = 'ptbr'",
        ");",
        "",
    ]

    inserts: list[tuple[int, int, str]] = []
    for legacy_id in sorted(expected, key=lambda x: legacy_to_post.get(x, 99999)):
        post_id = legacy_to_post.get(legacy_id)
        if not post_id:
            continue
        for term_id in sorted(expected[legacy_id]):
            inserts.append((post_id, term_id, legacy_id))

    lines.append(f"-- {len(inserts)} vínculos")
    for post_id, term_id, legacy_id in inserts:
        lines.append(
            f"INSERT OR IGNORE INTO edp_posts_taxonomies (post_id, term_id) VALUES ({post_id}, {term_id}); "
            f"-- {TERM_NAMES[term_id]}"
        )

    lines.extend(["", RESYNC_END, ""])
    return "\n".join(lines)


def strip_old_patches(import_sql: str) -> str:
    import_sql = re.sub(
        r"\n-- Categorias de jobs pt_BR sincronizadas com farra-2\.sql[\s\S]*?(?=\n-- edp_posts_media)",
        "\n",
        import_sql,
        count=1,
    )
    import_sql = re.sub(
        rf"\n{re.escape(RESYNC_START)}[\s\S]*?{re.escape(RESYNC_END)}\n",
        "\n",
        import_sql,
    )
    import_sql = re.sub(
        r"\nINSERT OR IGNORE INTO edp_posts_taxonomies \(post_id, term_id\)\n"
        r"SELECT \d+, \(SELECT id FROM edp_taxonomies WHERE slug='[^']+' AND type='categorias' LIMIT 1\)\n"
        r"WHERE EXISTS \(SELECT 1 FROM edp_taxonomies WHERE slug='[^']+' AND type='categorias'\);\n",
        "\n",
        import_sql,
    )
    return import_sql


def main() -> None:
    import_sql = strip_old_patches(IMPORT_PATH.read_text(encoding="utf-8"))
    conn = load_farra2()
    legacy_to_post = parse_import_jobs(import_sql)
    expected = expected_job_categories(conn)

    matched_jobs = sum(1 for legacy_id in expected if legacy_id in legacy_to_post)
    total_links = sum(
        len(terms) for legacy_id, terms in expected.items() if legacy_id in legacy_to_post
    )

    resync_sql = build_resync_sql(legacy_to_post, expected)
    pragma_marker = "\nPRAGMA foreign_keys = ON;"
    if pragma_marker not in import_sql:
        raise SystemExit("Marcador PRAGMA foreign_keys = ON não encontrado.")

    import_sql = import_sql.replace(pragma_marker, f"\n{resync_sql}{pragma_marker}", 1)
    IMPORT_PATH.write_text(import_sql, encoding="utf-8")

    print(f"jobs pt_BR no import: {len(legacy_to_post)}")
    print(f"jobs com categorias no farra-2: {matched_jobs}")
    print(f"vínculos aplicados: {total_links}")
    print(f"Resync gravado em {IMPORT_PATH}")


if __name__ == "__main__":
    main()
