import { describe, it, expect } from "vitest";
import {
  ADMIN_DB_LOCALE_CODES,
  ADMIN_URL_TO_DB_LOCALE,
  adminUrlLocaleToDbCode,
} from "../admin-locale-constants.ts";

describe("admin locale constants", () => {
  it("maps admin URL locales to DB locale codes", () => {
    expect(adminUrlLocaleToDbCode("pt-br")).toBe("pt_BR");
    expect(adminUrlLocaleToDbCode("es")).toBe("es_ES");
    expect(adminUrlLocaleToDbCode("en")).toBe("en_US");
  });

  it("keeps three canonical DB codes for admin i18n", () => {
    expect(ADMIN_DB_LOCALE_CODES).toEqual(["pt_BR", "es_ES", "en_US"]);
    expect(Object.values(ADMIN_URL_TO_DB_LOCALE).sort()).toEqual([
      "en_US",
      "es_ES",
      "pt_BR",
    ]);
  });
});
