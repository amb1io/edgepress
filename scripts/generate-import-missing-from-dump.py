#!/usr/bin/env python3
"""Gera SQL idempotente com posts do dump Untitled-1 ausentes do import CSV."""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DUMP_PATH = Path(
    "/Users/rhamses/.cursor/projects/Users-rhamses-Sites-farra-media-site-edgepress/uploads/Untitled-1-L1-L861-0.txt"
)
IMPORT_PATH = ROOT / "drizzle/seed/import-farramedia-edgepress.sql"
OUT_PATH = ROOT / "drizzle/seed/import-farramedia-edgepress-missing.sql"

# legacy category id (dump) -> edp_taxonomies.slug (pt_BR)
CATEGORY_SLUG_BY_LEGACY: dict[str, str] = {
    "c1a55c6c-a690-4842-9527-7fb2b252433f": "branded-entertainment-pt-br",
    "d8457323-6aa9-4a0c-8df5-e9681160a48f": "televisao-e-streaming-pt-br",
    "a63ad5b1-2e47-4fd1-a01e-34ffcc912c7c": "podcasts-pt-br",
    "8936b4a6-cc09-4f17-b0ad-489af05ca22a": "publicidade-pt-br",
    "547f3572-9ff3-40e6-9dfb-891fefabe4dd": "social-media-pt-br",
}

# legacy_id dump -> slug edp_posts existente (UPDATE legacy_id/conteúdo)
UPDATE_BY_LEGACY: dict[str, str] = {
    "7712290d-8412-4ad0-a21e-f31315374784": "criacao-e-roteiro-pt-br",
    "a9e683ae-8d07-4f02-80eb-7b4394dc1ba7": "creation-and-scriptwriting-en-us",
    "7e8503fb-1427-4878-bc01-d6a74f560b4d": "gui-cintra-pt-br",
    "741de2fb-f561-41ee-b7fb-3a71cde75cdf": "gui-cintra-en-us",
    "a3ddc26a-195e-4461-b68f-8c189d7c7945": "lives-e-eventos",
    "47ca8ad9-cfbb-4ccd-8842-e5967b597f06": "televisao-e-streaming",
    "04a2e628-89b4-4493-a292-d16ac68c7f5c": "rafi-pt-br",
}

SKIP_LEGACY_IDS = {
    "aca09aac-6171-4cf5-bb2d-7025e7c2b4ab",  # WARNER duplicado sem imagem
    "7eff350a-470f-49cf-bb9d-c80eaa2ae14b",  # tiposervicos duplicado
    "c4b7cd53-a193-43bf-96b2-530b9d1c9e75",  # tiposervicos duplicado
}

# Mantém body/idioma existentes no import; só sincroniza legacy_id e meta.
META_ONLY_UPDATE_SLUGS = {"rafi-pt-br"}


def sql_str(value: str) -> str:
    return value.replace("'", "''")


def normalize_body(value: str | None) -> str:
    if not value:
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"''", "'", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug or "item"


def parse_meta(tags_raw: str | None) -> dict:
    if not tags_raw:
        return {}
    arr = json.loads(tags_raw)
    if not arr:
        return {}
    return json.loads(arr[0])


def locale_code(language: str | None) -> str:
    if language == "enUS":
        return "en_US"
    return "pt_BR"


def load_dump() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(DUMP_PATH.read_text(encoding="utf-8"))
    return conn


def next_post_id(import_sql: str) -> int:
    ids = [int(x) for x in re.findall(r"INSERT OR REPLACE INTO edp_posts \(id,.*?VALUES \((\d+),", import_sql)]
    return max(ids) + 1 if ids else 1


def build_meta(post: sqlite3.Row, meta: dict, *, legacy_posttype: str | None = None) -> str:
    payload = dict(meta)
    payload["legacy_id"] = post["id"]
    if legacy_posttype:
        payload["legacy_posttype"] = legacy_posttype
    if post["image"]:
        payload["image"] = post["image"]
    if post["images"]:
        payload["images"] = post["images"]
    if post["slug"]:
        payload["slug"] = post["slug"]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def attachment_meta(image_url: str, title: str) -> str:
    filename = image_url.rsplit("/", 1)[-1]
    ext = filename.rsplit(".", 1)[-1].lower()
    mime = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "avif": "image/avif",
        "svg": "image/svg+xml",
    }.get(ext, "application/octet-stream")
    return json.dumps(
        {
            "show_in_menu": False,
            "menu_options": [],
            "icon": "line-md:file",
            "mime_type": mime,
            "attachment_file": filename,
            "attachment_path": image_url,
            "attachment_alt": title,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def insert_options_post(lines: list[str], post_id: int, post: sqlite3.Row, meta: dict) -> None:
    slug = slugify(post["title"])
    meta_json = build_meta(post, meta, legacy_posttype="options")
    lines.append(
        f"-- {post['title']} ({post['id']}) options\n"
        f"INSERT OR REPLACE INTO edp_posts (id, post_type_id, id_locale_code, title, slug, status, meta_values, published_at, created_at, updated_at)\n"
        f"VALUES ({post_id}, 1, (SELECT id FROM edp_locales WHERE locale_code='pt_BR' LIMIT 1), "
        f"'{sql_str(post['title'])}', '{sql_str(slug)}', 'published', '{sql_str(meta_json)}', "
        f"{post['createdOn']}, {post['createdOn']}, {post['updatedOn']});"
    )


def insert_job_post(
    lines: list[str],
    post_id: int,
    att_id: int | None,
    post: sqlite3.Row,
    meta: dict,
    slug: str,
    conn: sqlite3.Connection,
) -> None:
    locale = locale_code(meta.get("language"))
    meta_json = build_meta(post, meta, legacy_posttype="jobs")
    body = normalize_body(post["body"])
    lines.append(
        f"-- {post['title']} ({post['id']}) jobs\n"
        f"INSERT OR REPLACE INTO edp_posts (id, post_type_id, id_locale_code, title, slug, excerpt, body, status, meta_values, published_at, created_at, updated_at)\n"
        f"VALUES ({post_id}, 15, (SELECT id FROM edp_locales WHERE locale_code='{locale}' LIMIT 1), "
        f"'{sql_str(post['title'])}', '{sql_str(slug)}', '', '{sql_str(body)}', 'published', "
        f"'{sql_str(meta_json)}', {post['createdOn']}, {post['createdOn']}, {post['updatedOn']});"
    )

    if att_id and post["image"]:
        att_slug = f"attachment-jobs-{slug}"
        att_meta = attachment_meta(post["image"], post["title"])
        filename = post["image"].rsplit("/", 1)[-1]
        lines.append(
            f"INSERT OR REPLACE INTO edp_posts (id, post_type_id, title, slug, status, meta_values, created_at, updated_at)\n"
            f"VALUES ({att_id}, 6, '{sql_str(filename)}', '{sql_str(att_slug)}', 'published', "
            f"'{sql_str(att_meta)}', {post['createdOn']}, {post['updatedOn']});"
        )
        lines.append(
            f"INSERT OR IGNORE INTO edp_posts_media (post_id, media_id) VALUES ({post_id}, {att_id});"
        )
        lines.append(
            f"UPDATE edp_posts SET meta_values = json_set(meta_values, '$.post_thumbnail_id', '{att_id}') "
            f"WHERE id = {post_id};"
        )

    for cat_row in conn.execute(
        "SELECT categoryId FROM categoriesToPosts WHERE postId = ?", (post["id"],)
    ):
        legacy_cat = cat_row["categoryId"]
        tax_slug = CATEGORY_SLUG_BY_LEGACY.get(legacy_cat)
        if not tax_slug:
            continue
        lines.append(
            "INSERT OR IGNORE INTO edp_posts_taxonomies (post_id, term_id)\n"
            f"SELECT {post_id}, (SELECT id FROM edp_taxonomies WHERE slug='{tax_slug}' AND type='categorias' LIMIT 1)\n"
            f"WHERE EXISTS (SELECT 1 FROM edp_taxonomies WHERE slug='{tax_slug}' AND type='categorias');"
        )


def update_existing_post(lines: list[str], post: sqlite3.Row, meta: dict, target_slug: str) -> None:
    meta_only = target_slug in META_ONLY_UPDATE_SLUGS

    if meta_only:
        order = meta.get("order", 0)
        lines.append(
            f"-- sync {target_slug} <- legacy {post['id']} (meta parcial)\n"
            f"UPDATE edp_posts SET meta_values = json_set(json_set(meta_values, '$.legacy_id', '{sql_str(post['id'])}'), '$.order', {order}), "
            f"updated_at = {post['updatedOn']} WHERE slug = '{sql_str(target_slug)}';"
        )
        if target_slug == "rafi-pt-br":
            lines.append(
                "INSERT OR IGNORE INTO edp_posts_taxonomies (post_id, term_id)\n"
                "SELECT (SELECT id FROM edp_posts WHERE slug='rafi-pt-br' LIMIT 1), "
                "(SELECT id FROM edp_taxonomies WHERE slug='televisao-e-streaming-pt-br' AND type='categorias' LIMIT 1)\n"
                "WHERE EXISTS (SELECT 1 FROM edp_posts WHERE slug='rafi-pt-br') "
                "AND EXISTS (SELECT 1 FROM edp_taxonomies WHERE slug='televisao-e-streaming-pt-br' AND type='categorias');"
            )
        return

    meta_json = build_meta(post, meta, legacy_posttype=meta.get("posttype"))
    sets = [
        f"meta_values = '{sql_str(meta_json)}'",
        f"updated_at = {post['updatedOn']}",
    ]
    body = normalize_body(post["body"])
    if body:
        sets.append(f"body = '{sql_str(body)}'")
    lines.append(
        f"-- sync {target_slug} <- legacy {post['id']}\n"
        f"UPDATE edp_posts SET {', '.join(sets)} WHERE slug = '{sql_str(target_slug)}';"
    )


def main() -> None:
    import_sql = IMPORT_PATH.read_text(encoding="utf-8")
    import_legacy = set(re.findall(r'"legacy_id"\s*:\s*"([^"]+)"', import_sql))
    conn = load_dump()

    missing_rows = conn.execute(
        f"""
        SELECT * FROM posts
        WHERE id NOT IN ({",".join("?" * len(import_legacy)) or "''"})
        ORDER BY createdOn
        """,
        list(import_legacy),
    ).fetchall()

    lines: list[str] = [
        "-- Posts ausentes do import CSV (dump Untitled-1 / D1 legado)",
        "-- Gerado por scripts/generate-import-missing-from-dump.py",
        "",
    ]

    next_id = next_post_id(import_sql)

    for post in missing_rows:
        legacy_id = post["id"]
        if legacy_id in SKIP_LEGACY_IDS:
            continue

        meta = parse_meta(post["tags"])
        posttype = meta.get("posttype")

        if legacy_id in UPDATE_BY_LEGACY:
            update_existing_post(lines, post, meta, UPDATE_BY_LEGACY[legacy_id])
            continue

        if posttype == "options":
            insert_options_post(lines, next_id, post, meta)
            next_id += 1
            continue

        if posttype == "jobs":
            slug = post["slug"] or slugify(post["title"])
            if not slug.endswith("-pt-br") and locale_code(meta.get("language")) == "pt_BR":
                slug = f"{slug}-pt-br"
            att_id = next_id + 1 if post["image"] else None
            insert_job_post(lines, next_id, att_id, post, meta, slug, conn)
            next_id += 2 if att_id else 1
            continue

    OUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[generate-import-missing-from-dump] {len(lines)} linhas -> {OUT_PATH}")


if __name__ == "__main__":
    main()
