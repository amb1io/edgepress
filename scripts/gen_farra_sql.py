#!/usr/bin/env python3
"""Generate standalone SQL file for Farra posts and post_meta from the provided data."""
import re
import json

# Raw lines from Untitled-3 (data only - line number prefix removed)
RAW = r"""'O Maior Rótulo do Mundo | Heinz ','<p>Heinz fez uma ação com o maior rótulo do mundo, para mostrar os ingredientes do produto que estampavam a frente do rótulo. Era pra ser só um simples making of da ação, mas virou um mega videocase.</p>','1fxv3qd0d6qpqgk',1716419430000,1727312567069,'https://bucket.farra.media/heinz-1.png','["https://bucket.farra.media/01.jpg"]','["{\"videos\":\"https://vimeo.com/545666496\",\"videosHome\":null,\"videosHomeOrder\":null,\"order\":40,\"fichaTecnica\":[],\"language\":\"ptbr\",\"socialMedia\":null,\"reel\":null,\"posttype\":\"jobs\"}"]','o-maior-rotulo-do-mundo-heinz'"""

def parse_line(line):
    """Parse one CSV-like line with quoted fields (single-quote delimited)."""
    out = []
    i = 0
    n = len(line)
    while i < n:
        if line[i] == "'":
            i += 1
            start = i
            while i < n:
                if line[i] == "\\":
                    i += 2
                    continue
                if line[i] == "'":
                    # check for escaped '' 
                    if i + 1 < n and line[i + 1] == "'":
                        i += 2
                        continue
                    break
                i += 1
            out.append(line[start:i].replace("''", "'"))
            i += 1
        elif line[i] == ",":
            i += 1
        elif line[i].isspace():
            i += 1
        else:
            return None
        if i < n and line[i] == ",":
            i += 1
    return out if len(out) >= 9 else None

def extract_videos(meta_str):
    """From meta column (JSON array of stringified object), get videos as JSON string."""
    if not meta_str or meta_str.strip() in ("NULL", "null", ""):
        return "null"
    try:
        arr = json.loads(meta_str)
        if not arr:
            return "null"
        inner = arr[0] if isinstance(arr[0], str) else arr[0]
        if isinstance(inner, str):
            obj = json.loads(inner)
        else:
            obj = inner
        v = obj.get("videos")
        if v is None:
            return "null"
        return json.dumps(v, ensure_ascii=False)
    except Exception:
        return "null"

def sql_esc(s):
    if s is None or (isinstance(s, str) and s.strip().upper() == "NULL"):
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"

def main():
    # Read from stdin so we can pipe the data file
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    else:
        # Use embedded single line for test
        lines = [RAW]

    out = []
    out.append("-- Standalone SQL: Farra posts and post_meta (videos, images as custom fields)")
    out.append("-- No dependency on project schema.\n")
    out.append("DROP TABLE IF EXISTS post_meta;")
    out.append("DROP TABLE IF EXISTS posts;")
    out.append("""
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  featured_image_url TEXT,
  slug TEXT
);
""")
    out.append("""
CREATE TABLE post_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id)
);
""")

    for line in lines:
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        # Remove leading line number if present (e.g. "     1|")
        if "|" in line[:8]:
            idx = line.find("|")
            line = line[idx + 1:]
        parts = parse_line(line)
        if not parts or len(parts) < 9:
            continue
        title, content, author_id, created_at, updated_at, feat_img, images, meta, slug = parts[:9]
        if not title:
            continue
        feat_sql = sql_esc(feat_img) if feat_img and feat_img.strip().upper() != "NULL" else "NULL"
        slug_sql = sql_esc(slug) if slug else "NULL"
        videos_json = extract_videos(meta)
        images_val = images if images and images.strip().upper() != "NULL" else "null"
        out.append("INSERT INTO posts (title, content, author_id, created_at, updated_at, featured_image_url, slug) VALUES ({}, {}, {}, {}, {}, {}, {});".format(
            sql_esc(title), sql_esc(content), sql_esc(author_id), created_at or "NULL", updated_at or "NULL", feat_sql, slug_sql
        ))
        out.append("INSERT INTO post_meta (post_id, meta_key, meta_value) VALUES (last_insert_rowid(), 'videos', {});".format(sql_esc(videos_json) if videos_json != "null" else "NULL"))
        out.append("INSERT INTO post_meta (post_id, meta_key, meta_value) VALUES (last_insert_rowid(), 'images', {});".format(sql_esc(images_val) if images_val != "null" else "NULL"))

    print("\n".join(out))

if __name__ == "__main__":
    main()
