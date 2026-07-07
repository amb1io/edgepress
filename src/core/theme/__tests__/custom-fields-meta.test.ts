import { describe, expect, it } from "vitest";
import { injectCustomFieldsMeta } from "../custom-fields-meta.ts";

describe("injectCustomFieldsMeta", () => {
  it("flattens block slug and field name into meta keys", () => {
    const meta: Record<string, string> = {};
    injectCustomFieldsMeta(meta, [
      {
        id: 1,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        fields: [
          { name: "cargo", value: "Sócio, diretor e roteirista" },
          { name: "dono", value: "sim" },
        ],
      },
    ]);

    expect(meta).toEqual({
      "dados-da-equipe_cargo": "Sócio, diretor e roteirista",
      "dados-da-equipe_dono": "sim",
    });
  });

  it("does not overwrite existing meta_values keys", () => {
    const meta: Record<string, string> = {
      "dados-da-equipe_cargo": "Valor existente",
    };
    injectCustomFieldsMeta(meta, [
      {
        id: 1,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        fields: [{ name: "cargo", value: "Novo valor" }],
      },
    ]);

    expect(meta["dados-da-equipe_cargo"]).toBe("Valor existente");
  });

  it("skips empty field values", () => {
    const meta: Record<string, string> = {};
    injectCustomFieldsMeta(meta, [
      {
        id: 1,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        fields: [
          { name: "cargo", value: "" },
          { name: "dono", value: "sim" },
        ],
      },
    ]);

    expect(meta).toEqual({ "dados-da-equipe_dono": "sim" });
  });
});
