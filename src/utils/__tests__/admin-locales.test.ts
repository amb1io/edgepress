import { describe, it, expect, vi } from "vitest";
import { resolveSiteTranslationLocales, getSiteLocaleIdsFromSettings } from "../admin-locales.ts";

describe("resolveSiteTranslationLocales", () => {
  it("returns empty array when site_locales is empty", async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ value: "" }]),
          }),
        }),
      })),
    };

    expect(await getSiteLocaleIdsFromSettings(db)).toEqual([]);
    expect(await resolveSiteTranslationLocales(db)).toEqual([]);
  });

  it("returns locales from site_locales ids sorted by language", async () => {
    const localeRows = [
      {
        id: 1,
        locale_code: "pt_BR",
        language: "Português",
        hello_world: "Olá",
        country: "BR",
      },
      {
        id: 2,
        locale_code: "en_US",
        language: "English",
        hello_world: "Hello",
        country: "US",
      },
    ];

    let selectCount = 0;
    const db = {
      select: vi.fn(() => {
        selectCount += 1;
        if (selectCount === 1) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ value: "2,1" }]),
              }),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve(localeRows),
          }),
        };
      }),
    };

    const rows = await resolveSiteTranslationLocales(db);
    expect(rows.map((r) => r.locale_code)).toEqual(["en_US", "pt_BR"]);
    expect(rows.every((r) => typeof r.isAdminLocale === "boolean")).toBe(true);
  });
});
