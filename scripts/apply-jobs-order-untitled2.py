#!/usr/bin/env python3
"""Aplica ordem de jobs pt_BR (Untitled-2) no import SQL e migrate-jobs-order-pt-br.sql."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT_PATH = ROOT / "drizzle/seed/import-farramedia-edgepress.sql"
MIGRATE_ORDER_PATH = ROOT / "drizzle/seed/migrate-jobs-order-pt-br.sql"

TARGET_ORDER = [
    "NEM TE CONTO - LUANA PIOVANI E A FOFOCA | AUDIBLE",
    "TRUCO MASTERS",
    "ABERTO AO PÚBLICO | GLOBO",
    "PÍLULA DE FARINHA - O ESCÂNDALO QUE GEROU VIDAS",
    "NO RITMO DA LORE | TEMPORADA 4",
    "MARKETING DAY - NEM TE CONTO COM LUANA PIOVANI | AUDIBLE",
    "HAPPY HOUR FORA DA CASA COM VALEN BANDEIRA | DISNEY +",
    "DO QUE RIEM? | PARAMOUNT+",
    "DEVDAY EXCHANGE | OPEN AI",
    "NO RITMO DA LORE",
    "ORGANIZAÇÃO PURA - NOVELA VERTICAL | BV FINANCEIRA",
    "FAMILHÃO | DOMINGÃO DO HUCK",
    "LANÇAMENTO LIGHTYEAR | DISNEY",
    "TOCA REVELA - O REALITY | UOL",
    "CONTROLE DE QUALIDADE COM REGINA VOLPATO | PARAMOUNT +",
    "RAFI",
    "CAMPANHA DIGITAL - PÍLULA DE FARINHA | HBO MAX",
    "DIAS DAS MÃES DUDALINA COM MARIA FERNANDA CÂNDIDO",
    "CORRIDA DE SÃO SYLVESTER | PARAMOUNT+",
    "O PODER DA ESCOLHA | RENNOVA",
    "TATI FOLIA 2025",
    "POSSO MANDAR ÁUDIO? | GLOBOPLAY",
    "EXPEDIÇÃO ULTRAVIOLETA | NUBANK",
    "CURSO LIVELO | LIVELO",
    "CAMPANHA DIGITAL: ABERTO AO PÚBLICO TEMPORADA 1 E 2 | TVGLOBO",
    "KNUCKLES | PARAMOUNT +",
    "NATAL | DUDALINA",
    "PIX | ITAÚ",
    "SUPER LIVE BLACK FRIDAY | SHOPTIME",
    "ROCK IN RIO | TIM",
    "DIA DOS PAIS | FARFETCH",
    "PROJETO UPLOAD | CNN BRASIL",
    "LANÇAMENTO LUCA | DISNEY+",
    "DIA DAS MÃES | DUDALINA",
    "JÁ FUI VOCÊ | NATURA + MIBR",
    "GASTRONOMIA PERIFÉRICA | CONTINENTAL",
    "DIA DOS PAIS | DUDALINA",
    "DIA DAS MÃES | SHEIN",
    "BOCA A BOCA | LIVE",
    "ESPECIAL LUCA | DISNEY",
    "PALCO PARAMOUNT CCXP23 | PARAMOUNT+",
    "LIVE OSCAR | OMELETE",
    "MÁS BUENO. MÁS BREYERS | BREYERS",
    "ENERGIA VERDE | HEINEKEN",
    "CCXP WORLDS 2021 – ROAD TO ARTISTS’ VALLEY | SANTANDER",
    "FOI MAU | REDETV!",
    "LANÇAMENTO UM CAVALEIRO EM MOSCOU | PARAMOUNT +",
    "FOCA EM 2023 | FOQUINHA",
    "SUPOSITÓRIO | SPOTIFY",
    "OTALAB | UOL",
    "REDES SOCIAIS ÚLTIMAS FÉRIAS | STAR+",
    "VIDENTE POR ACIDENTE | CINEMA",
    "CCXP WORLDS 2020 | OMELETE",
    "DESEJOS S.A. | STAR+",
    "QUADROS ORIGINAIS REDES | LUCIANO HUCK",
    "ART ATTACK – MODO DESAFIO | DISNEY",
    "FOQUINHA ENTREVISTA | VIDEOCAST",
    "CTRL SER + CTRL VER | UNIVERSA UOL",
    "TÁ VOANDO | ITAÚ",
    "#LEGADO | CANNABIS THINKING",
    "LADY LESTE | GLÓRIA GROOVE",
    "GATO GALÁCTICO E O FEITIÇO DO TEMPO | CINEMA",
    "À MODA DA ISA | UOL",
    "À MODA DA ISA – VERÃO | UOL",
    "FOCA EM 2021 | TIK TOK",
    "PODCASTS PORTA DOS FUNDOS | DEEZER",
    "PLANTÃO | LIQUIDA SHOPTIME",
    "RECEITAS DE FIM DE SEMANA | NESTLÉ",
    "MAIS VIVIDAS | MOLICO",
    "PÕE CREMOSIDADE NISSO | NESTLÉ",
    "DEU RUIM | RECEITAS NESTLÉ",
    "NUTRI AJUDA | NUTREN",
    "CHOCOLATERIA | GAROTO",
    "ESCOLHAS CERTAS | MAGGI",
    "BRASIL SABORES MIL | RECEITAS NESTLÉ",
    "DONOS DA RAZÃO | PODCAST",
    "KIUNE TALKS | KIUNE",
    "BATALHA DOS ELIMINADOS | SPLASH UOL",
    "#LOGITECHNABGS | LOGITECH",
    "COMPRO LIKES | STAR+",
    "ACUVUE | REDES OTAVIANO E FLÁVIA ALESSANDRA",
    "TODDY | REDES OTAVIANO COSTA",
    "A ÚLTIMA PEÇA | CINEMA",
    "CREATORS | KWAI",
    "CAFÉ COM LATE SHOW | NESCAFÉ",
    "DE VOLTA PARA UM FUTURO MELHOR | NESTLÉ",
    "NESTATUETA DE OURO | NESCAU",
    "NESTON CHEF | NESTON",
    "CONVENÇÃO COMERCIAL | NESTLÉ",
    "ABERTURA CONVENÇÃO | NESTLÉ",
    "CONVENÇÃO | STARBUCKS",
    "LANÇAMENTO | STAR+",
    "MIL E UMA TRETAS | VIDEOCAST",
    "TERAPIA COM EX | HISTÓRIAS DE TERAPIA",
    "MONSTER MANSION | FANTA",
    "PLANTA FAZ ISSO? | VIDEOCAST",
    "POSSO EXPLICAR COM MIÁ MELLO | NATGEO",
    "COACH NADA | LADDY NADA",
    "MEME DA COMÉDIA | TNT",
    "FOCA EM 2020 | LIVE",
    "PREPARE SEU CORAÇÃO | SPOTIFY",
    "ASCENDENTE EM MÚSICA | SPOTIFY",
    "ROMA | NETFLIX",
    "CONSELHO FORA DE CLASSE | VIDEOCAST",
    "THE CROWN COM ELZA SOARES | NETFLIX",
    "DIÁRIO DO OLIVIER | GNT",
    "INTERROGATÓRIO COM KEVIN - ELITE | NETFLIX",
    "RESOLVI ESPERAR COM SANDY - LA CASA DE PAPEL | NETFLIX",
    "MATILHA | FRANCISCO EL HOMBRE",
    "EL CAMINO COM MAURICIO MEIRELLES | NETFLIX",
    "SEUS MOMENTOS SUA VIDA | CANON",
    "O MAIOR RÓTULO DO MUNDO | HEINZ",
    "QUEM VIVER, VERÃO | SKOL",
    "#CHEGADEESTIGMA | INTIMUS / KOTEX",
    "#RECEITASDEUMAPANELASÓ | ROCHEDO",
    "LANÇAMENTOS | NETFLIX",
    "CONVENÇÃO | NESTLÉ",
    "RECEITAS NESTLÉ | NESTLÉ",
]

SLUG_BY_TARGET: dict[str, str] = {
    "NEM TE CONTO - LUANA PIOVANI E A FOFOCA | AUDIBLE": "nem-te-conto-luana-piovani-e-a-fofoca-audible-pt-br",
    "NO RITMO DA LORE | TEMPORADA 4": "no-ritmo-da-lore-temporada-4-pt-br",
    "MARKETING DAY - NEM TE CONTO COM LUANA PIOVANI | AUDIBLE": "marketing-day-nem-te-conto-com-luana-piovani-audible-pt-br",
    "HAPPY HOUR FORA DA CASA COM VALEN BANDEIRA | DISNEY +": "happy-hour-fora-da-casa-com-valen-bandeira-disney-pt-br",
    "TRUCO MASTERS": "truco-masters-pt-br",
    "ABERTO AO PÚBLICO | GLOBO": "aberto-ao-publico-globo-pt-br",
    "PÍLULA DE FARINHA - O ESCÂNDALO QUE GEROU VIDAS": "pilula-de-farinha-o-escandalo-que-gerou-vidas-pt-br",
    "DO QUE RIEM? | PARAMOUNT+": "do-que-riem-paramount-pt-br",
    "DEVDAY EXCHANGE | OPEN AI": "devday-exchange-open-ai-pt-br",
    "NO RITMO DA LORE": "no-ritmo-da-lore-pt-br",
    "ORGANIZAÇÃO PURA - NOVELA VERTICAL | BV FINANCEIRA": "organizacao-pura-novela-vertical-bv-financeira-pt-br",
    "FAMILHÃO | DOMINGÃO DO HUCK": "familhao-domingao-do-huck-pt-br",
    "LANÇAMENTO LIGHTYEAR | DISNEY": "lancamento-lightyear-disney-pt-br",
    "TOCA REVELA - O REALITY | UOL": "toca-revela-o-reality-uol-pt-br",
    "CONTROLE DE QUALIDADE COM REGINA VOLPATO | PARAMOUNT +": "controle-de-qualidade-com-regina-volpato-paramount-pt-br",
    "RAFI": "rafi-pt-br",
    "CAMPANHA DIGITAL - PÍLULA DE FARINHA | HBO MAX": "campanha-digital-pilula-de-farinha-hbo-max-pt-br",
    "DIAS DAS MÃES DUDALINA COM MARIA FERNANDA CÂNDIDO": "dias-das-maes-dudalina-com-maria-fernanda-candido-pt-br",
    "CORRIDA DE SÃO SYLVESTER | PARAMOUNT+": "corrida-de-sao-sylvester-paramount-pt-br",
    "O PODER DA ESCOLHA | RENNOVA": "o-poder-da-escolha-rennova-pt-br",
    "TATI FOLIA 2025": "tati-folia-2025-pt-br",
    "POSSO MANDAR ÁUDIO? | GLOBOPLAY": "posso-mandar-audio-globoplay-pt-br",
    "EXPEDIÇÃO ULTRAVIOLETA | NUBANK": "expedicao-ultravioleta-nubank-pt-br",
    "CURSO LIVELO | LIVELO": "curso-livelo-livelo-pt-br",
    "CAMPANHA DIGITAL: ABERTO AO PÚBLICO TEMPORADA 1 E 2 | TVGLOBO": "campanha-digital-aberto-ao-publico-temporada-1-e-2-tvglobo-pt-br",
    "KNUCKLES | PARAMOUNT +": "knuckles-paramount-pt-br",
    "NATAL | DUDALINA": "natal-dudalina-pt-br",
    "PIX | ITAÚ": "pix-itau-pt-br",
    "SUPER LIVE BLACK FRIDAY | SHOPTIME": "super-live-black-friday-shoptime-pt-br",
    "ROCK IN RIO | TIM": "rock-in-rio-tim-pt-br",
    "DIA DOS PAIS | FARFETCH": "dia-dos-pais-farfetch-pt-br",
    "PROJETO UPLOAD | CNN BRASIL": "projeto-upload-cnn-brasil-pt-br",
    "LANÇAMENTO LUCA | DISNEY+": "lancamento-luca-disney-pt-br",
    "DIA DAS MÃES | DUDALINA": "dia-das-maes-dudalina-pt-br",
    "JÁ FUI VOCÊ | NATURA + MIBR": "ja-fui-voce-natura-mibr-pt-br",
    "GASTRONOMIA PERIFÉRICA | CONTINENTAL": "gastronomia-periferica-continental-pt-br",
    "DIA DOS PAIS | DUDALINA": "dia-dos-pais-dudalina-pt-br",
    "DIA DAS MÃES | SHEIN": "dia-das-maes-shein-pt-br",
    "BOCA A BOCA | LIVE": "boca-a-boca-live-pt-br",
    "ESPECIAL LUCA | DISNEY": "especial-luca-disney-pt-br",
    "PALCO PARAMOUNT CCXP23 | PARAMOUNT+": "palco-paramount-ccxp23-paramount-pt-br",
    "LIVE OSCAR | OMELETE": "live-oscar-omelete-pt-br",
    "MÁS BUENO. MÁS BREYERS | BREYERS": "mas-bueno-mas-breyers-breyers-pt-br",
    "ENERGIA VERDE | HEINEKEN": "energia-verde-heineken-pt-br",
    "CCXP WORLDS 2021 – ROAD TO ARTISTS’ VALLEY | SANTANDER": "ccxp-worlds-2021-road-to-artists-valley-santander-pt-br",
    "FOI MAU | REDETV!": "foi-mau-redetv-pt-br",
    "LANÇAMENTO UM CAVALEIRO EM MOSCOU | PARAMOUNT +": "lancamento-um-cavaleiro-em-moscou-paramount-pt-br",
    "FOCA EM 2023 | FOQUINHA": "foca-em-2023-foquinha-pt-br",
    "SUPOSITÓRIO | SPOTIFY": "supositorio-spotify-pt-br",
    "OTALAB | UOL": "otalab-uol-pt-br",
    "REDES SOCIAIS ÚLTIMAS FÉRIAS | STAR+": "redes-sociais-ultimas-ferias-star-pt-br",
    "VIDENTE POR ACIDENTE | CINEMA": "vidente-por-acidente-cinema-pt-br",
    "CCXP WORLDS 2020 | OMELETE": "ccxp-worlds-2020-omelete-pt-br",
    "DESEJOS S.A. | STAR+": "desejos-sa-star-pt-br",
    "QUADROS ORIGINAIS REDES | LUCIANO HUCK": "quadros-originais-redes-luciano-huck-pt-br",
    "ART ATTACK – MODO DESAFIO | DISNEY": "art-attack-modo-desafio-disney-pt-br",
    "FOQUINHA ENTREVISTA | VIDEOCAST": "foquinha-entrevista-videocast-pt-br",
    "CTRL SER + CTRL VER | UNIVERSA UOL": "ctrl-ser-ctrl-ver-universa-uol-pt-br",
    "TÁ VOANDO | ITAÚ": "ta-voando-itau-pt-br",
    "#LEGADO | CANNABIS THINKING": "legado-cannabis-thinking-pt-br",
    "LADY LESTE | GLÓRIA GROOVE": "lady-leste-gloria-groove-pt-br",
    "GATO GALÁCTICO E O FEITIÇO DO TEMPO | CINEMA": "gato-galactico-e-o-feitico-do-tempo-cinema-pt-br",
    "À MODA DA ISA | UOL": "a-moda-da-isa-uol-pt-br",
    "À MODA DA ISA – VERÃO | UOL": "a-moda-da-isa-verao-uol-pt-br",
    "FOCA EM 2021 | TIK TOK": "foca-em-2021-tik-tok-pt-br",
    "PODCASTS PORTA DOS FUNDOS | DEEZER": "podcasts-porta-dos-fundos-deezer-pt-br",
    "PLANTÃO | LIQUIDA SHOPTIME": "plantao-liquida-shoptime-pt-br",
    "RECEITAS DE FIM DE SEMANA | NESTLÉ": "receitas-de-fim-de-semana-nestle-pt-br",
    "MAIS VIVIDAS | MOLICO": "mais-vividas-molico-pt-br",
    "PÕE CREMOSIDADE NISSO | NESTLÉ": "poe-cremosidade-nisso-nestle-pt-br",
    "DEU RUIM | RECEITAS NESTLÉ": "deu-ruim-receitas-nestle-pt-br",
    "NUTRI AJUDA | NUTREN": "nutri-ajuda-nutren-pt-br",
    "CHOCOLATERIA | GAROTO": "chocolateria-garoto-pt-br",
    "ESCOLHAS CERTAS | MAGGI": "escolhas-certas-maggi-pt-br",
    "BRASIL SABORES MIL | RECEITAS NESTLÉ": "brasil-sabores-mil-receitas-nestle-pt-br",
    "DONOS DA RAZÃO | PODCAST": "donos-da-razao-podcast-pt-br",
    "KIUNE TALKS | KIUNE": "kiune-talks-kiune-pt-br",
    "BATALHA DOS ELIMINADOS | SPLASH UOL": "batalha-dos-eliminados-splash-uol-pt-br",
    "#LOGITECHNABGS | LOGITECH": "logitechnabgs-logitech-pt-br",
    "COMPRO LIKES | STAR+": "compro-likes-star-pt-br",
    "ACUVUE | REDES OTAVIANO E FLÁVIA ALESSANDRA": "acuvue-redes-otaviano-e-flavia-alessandra-pt-br",
    "TODDY | REDES OTAVIANO COSTA": "toddy-redes-otaviano-costa-pt-br",
    "A ÚLTIMA PEÇA | CINEMA": "a-ultima-peca-cinema-pt-br",
    "CREATORS | KWAI": "creators-kwai-pt-br",
    "CAFÉ COM LATE SHOW | NESCAFÉ": "cafe-com-late-show-nescafe-pt-br",
    "DE VOLTA PARA UM FUTURO MELHOR | NESTLÉ": "de-volta-para-um-futuro-melhor-nestle-pt-br",
    "NESTATUETA DE OURO | NESCAU": "nestatueta-de-ouro-nescau-pt-br",
    "NESTON CHEF | NESTON": "neston-chef-neston-pt-br",
    "CONVENÇÃO COMERCIAL | NESTLÉ": "convencao-comercial-nestle-pt-br",
    "ABERTURA CONVENÇÃO | NESTLÉ": "abertura-convencao-nestle-pt-br",
    "CONVENÇÃO | STARBUCKS": "convencao-starbucks-pt-br",
    "LANÇAMENTO | STAR+": "lancamento-star-pt-br",
    "MIL E UMA TRETAS | VIDEOCAST": "mil-e-uma-tretas-videocast-pt-br",
    "TERAPIA COM EX | HISTÓRIAS DE TERAPIA": "terapia-com-ex-historias-de-terapia-pt-br",
    "MONSTER MANSION | FANTA": "monster-mansion-fanta-pt-br",
    "PLANTA FAZ ISSO? | VIDEOCAST": "planta-faz-isso-videocast-pt-br",
    "POSSO EXPLICAR COM MIÁ MELLO | NATGEO": "posso-explicar-com-mia-mello-natgeo-pt-br",
    "COACH NADA | LADDY NADA": "coach-nada-laddy-nada-pt-br",
    "MEME DA COMÉDIA | TNT": "meme-da-comedia-tnt-pt-br",
    "FOCA EM 2020 | LIVE": "foca-em-2020-live-pt-br",
    "PREPARE SEU CORAÇÃO | SPOTIFY": "prepare-seu-coracao-spotify-pt-br",
    "ASCENDENTE EM MÚSICA | SPOTIFY": "ascendente-em-musica-spotify-pt-br",
    "ROMA | NETFLIX": "roma-netflix-pt-br",
    "CONSELHO FORA DE CLASSE | VIDEOCAST": "conselho-fora-de-classe-videocast-pt-br",
    "THE CROWN COM ELZA SOARES | NETFLIX": "the-crown-com-elza-soares-netflix-pt-br",
    "DIÁRIO DO OLIVIER | GNT": "diario-do-olivier-gnt-pt-br",
    "INTERROGATÓRIO COM KEVIN - ELITE | NETFLIX": "interrogatorio-com-kevin-elite-netflix-pt-br",
    "RESOLVI ESPERAR COM SANDY - LA CASA DE PAPEL | NETFLIX": "resolvi-esperar-com-sandy-la-casa-de-papel-netflix-pt-br",
    "MATILHA | FRANCISCO EL HOMBRE": "matilha-francisco-el-hombre-pt-br",
    "EL CAMINO COM MAURICIO MEIRELLES | NETFLIX": "el-camino-com-mauricio-meirelles-netflix-pt-br",
    "SEUS MOMENTOS SUA VIDA | CANON": "seus-momentos-sua-vida-canon-pt-br",
    "O MAIOR RÓTULO DO MUNDO | HEINZ": "o-maior-rotulo-do-mundo-heinz-pt-br",
    "QUEM VIVER, VERÃO | SKOL": "quem-viver-verao-skol-pt-br",
    "#CHEGADEESTIGMA | INTIMUS / KOTEX": "chegadeestigma-intimus-kotex-pt-br",
    "#RECEITASDEUMAPANELASÓ | ROCHEDO": "receitasdeumapanelaso-rochedo-pt-br",
    "LANÇAMENTOS | NETFLIX": "lancamentos-netflix-pt-br",
    "CONVENÇÃO | NESTLÉ": "convencao-nestle-pt-br",
    "RECEITAS NESTLÉ | NESTLÉ": "receitas-nestle-nestle-pt-br",
}

DRAFT_SLUGS = {"devs-de-impacto-open-ai-pt-br"}


def norm_slug(s: str) -> str:
    return s.strip().lower()


def order_for_position(position: int, total: int) -> int:
    return total - position + 1


def split_sql_statements(text: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    for line in text.splitlines(keepends=True):
        current.append(line)
        if line.rstrip().endswith(");"):
            statements.append("".join(current))
            current = []
    if current:
        statements.append("".join(current))
    return statements


def patch_meta_order(statement: str, order: int) -> str:
    marker = "'published', '"
    idx = statement.find(marker)
    if idx == -1:
        return statement
    start = idx + len(marker)
    end = statement.find("',", start)
    if end == -1:
        return statement
    raw = statement[start:end].replace("''", "'")
    meta = json.loads(raw)
    meta["order"] = order
    escaped = json.dumps(meta, ensure_ascii=False, separators=(",", ":")).replace("'", "''")
    return statement[:start] + escaped + statement[end:]


def extract_job_slug(statement: str) -> str | None:
    for m in re.finditer(r"'((?!attachment)[a-z0-9-]+-pt-br)'", statement, re.IGNORECASE):
        return norm_slug(m.group(1))
    return None


def is_pt_br_job_statement(statement: str) -> bool:
    if "INSERT OR REPLACE INTO edp_posts" not in statement:
        return False
    if not re.search(r",\s*15\s*,", statement):
        return False
    if '"posttype":"jobs"' not in statement and '"legacy_posttype":"jobs"' not in statement:
        return False
    if "attachment-jobs-" in statement:
        return False
    return (
        ", 41," in statement
        or "locale_code='pt_BR'" in statement
        or 'locale_code="pt_BR"' in statement
    )


def patch_slug_in_import(text: str, slug: str, order: int) -> tuple[str, bool]:
    slug_marker = f"'{slug}'"
    slug_pos = text.find(slug_marker)
    if slug_pos == -1:
        return text, False

    insert_start = text.rfind("INSERT OR REPLACE INTO edp_posts", 0, slug_pos)
    if insert_start == -1:
        return text, False

    end = text.find(");", slug_pos)
    if end == -1:
        return text, False
    end += 2

    statement = text[insert_start:end]
    if not is_pt_br_job_statement(statement):
        return text, False
    if extract_job_slug(statement) != slug:
        return text, False

    patched = patch_meta_order(statement, order)
    return text[:insert_start] + patched + text[end:], True


def main() -> None:
    total = len(TARGET_ORDER)
    slug_to_order = {
        SLUG_BY_TARGET[title]: order_for_position(i, total) for i, title in enumerate(TARGET_ORDER, 1)
    }

    missing_slugs = [s for s in slug_to_order if s not in {norm_slug(s) for s in slug_to_order}]
    _ = missing_slugs

    import_text = IMPORT_PATH.read_text(encoding="utf-8")
    updated = 0
    seen_slugs: set[str] = set()

    for title in TARGET_ORDER:
        slug = SLUG_BY_TARGET[title]
        order = slug_to_order[slug]
        import_text, ok = patch_slug_in_import(import_text, slug, order)
        if ok:
            seen_slugs.add(slug)
            updated += 1

    IMPORT_PATH.write_text(import_text, encoding="utf-8")

    migrate_lines = [
        f"-- Jobs pt_BR — ordem Untitled-2 ({total} trabalhos)",
        f"-- Posição 1 = order {total}; posição {total} = order 1 (sort DESC no frontend)",
        "-- Idempotente: pode rodar mais de uma vez",
        "",
        "-- Duplicata legada fora da grade",
        "UPDATE edp_posts SET status = 'draft', meta_values = json_set(meta_values, '$.order', 0)",
        "WHERE slug = 'devs-de-impacto-open-ai-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';",
        "",
    ]

    for i, title in enumerate(TARGET_ORDER, 1):
        order = order_for_position(i, total)
        slug = SLUG_BY_TARGET[title]
        migrate_lines.append(
            f"-- {order:3d} | pos {i:3d} | {title}\n"
            f"UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', {order}) "
            f"WHERE slug = '{slug}' AND json_extract(meta_values, '$.posttype') = 'jobs';"
        )

    MIGRATE_ORDER_PATH.write_text("\n".join(migrate_lines) + "\n", encoding="utf-8")

    not_in_import = sorted(set(slug_to_order) - seen_slugs)
    print(f"[apply-jobs-order-untitled2] updated {updated} import rows")
    print(f"[apply-jobs-order-untitled2] migrate -> {MIGRATE_ORDER_PATH}")
    if not_in_import:
        print("Slugs not found in import:")
        for slug in not_in_import:
            print(f"  - {slug}")


if __name__ == "__main__":
    main()
