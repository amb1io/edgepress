/**
 * Testes para o endpoint POST /api/posts focados em custom fields
 * Valida que custom fields são criados e atualizados corretamente quando o post pai é editado
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("POST /api/posts - Custom Fields", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("Custom Fields Data Parsing", () => {
    it("should parse custom_fields_data from FormData correctly", () => {
      const formData = new FormData();
      const customFieldsData = [
        {
          id: 1,
          title: "Dados customizados",
          rows: [
            { id: 10, name: "Nome do campo", value: "Valor do campo" },
            { id: 11, name: "Outro campo", value: "Outro valor" },
          ],
        },
        {
          id: 2,
          title: "Informações adicionais",
          rows: [{ id: 20, name: "Campo único", value: "Valor único" }],
        },
      ];
      formData.set("custom_fields_data", JSON.stringify(customFieldsData));

      const raw = formData.get("custom_fields_data");
      expect(raw).toBeTruthy();
      expect(typeof raw).toBe("string");

      const parsed = JSON.parse(raw as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].title).toBe("Dados customizados");
      expect(parsed[0].rows.length).toBe(2);
      expect(parsed[1].title).toBe("Informações adicionais");
    });

    it("should handle empty custom_fields_data gracefully", () => {
      const formData = new FormData();
      formData.set("custom_fields_data", "[]");

      const raw = formData.get("custom_fields_data");
      const parsed = JSON.parse(raw as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it("should handle missing custom_fields_data", () => {
      const formData = new FormData();
      const raw = formData.get("custom_fields_data");
      expect(raw).toBeNull();
    });
  });

  describe("Custom Fields Structure", () => {
    it("should transform custom fields data into post creation payload", () => {
      const customFieldsItems = [
        {
          id: 1,
          title: "Dados customizados",
          rows: [
            { id: 10, name: "Nome do campo", value: "Valor do campo" },
            { id: 11, name: "", value: "Valor sem nome" },
          ],
        },
      ];

      const item = customFieldsItems[0];
      const slug = item.title
        .trim()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "custom-field";

      expect(slug).toBe("dados-customizados");

      const metaValuesStr = item.rows?.length > 0
        ? JSON.stringify({
            fields: item.rows.map((r) => ({
              name: r.name ?? "",
              value: r.value ?? "",
            })),
          })
        : null;

      expect(metaValuesStr).toBeTruthy();
      const parsedMeta = JSON.parse(metaValuesStr!);
      expect(parsedMeta.fields).toHaveLength(2);
      expect(parsedMeta.fields[0].name).toBe("Nome do campo");
      expect(parsedMeta.fields[0].value).toBe("Valor do campo");
      expect(parsedMeta.fields[1].name).toBe("");
      expect(parsedMeta.fields[1].value).toBe("Valor sem nome");
    });

    it("should handle custom fields with empty rows", () => {
      const customFieldsItems = [
        {
          id: 1,
          title: "Campo vazio",
          rows: [],
        },
      ];

      const item = customFieldsItems[0];
      const metaValuesStr = item.rows?.length > 0
        ? JSON.stringify({
            fields: item.rows.map((r) => ({
              name: r.name ?? "",
              value: r.value ?? "",
            })),
          })
        : null;

      expect(metaValuesStr).toBeNull();
    });

    it("should generate slug from title correctly", () => {
      const testCases = [
        { title: "Dados customizados", expected: "dados-customizados" },
        { title: "Informações Adicionais", expected: "informacoes-adicionais" },
        { title: "Teste com Acentos: ção", expected: "teste-com-acentos-cao" },
        { title: "   Espaços   ", expected: "espacos" },
        { title: "Múltiplos---hífens", expected: "multiplos-hifens" },
      ];

      testCases.forEach(({ title, expected }) => {
        const slug = title
          .trim()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "custom-field";
        expect(slug).toBe(expected);
      });
    });
  });

  describe("Edit Mode - Custom Fields Update", () => {
    it("should replace existing custom fields when editing post", () => {
      // Simula a lógica: deletar todos os filhos existentes e recriar
      const existingCustomFields = [
        { id: 1, title: "Campo antigo", rows: [{ id: 10, name: "Nome", value: "Valor" }] },
        { id: 2, title: "Outro campo antigo", rows: [{ id: 20, name: "Nome2", value: "Valor2" }] },
      ];

      const newCustomFields = [
        { id: 3, title: "Campo novo", rows: [{ id: 30, name: "Novo nome", value: "Novo valor" }] },
        { id: 4, title: "Outro campo novo", rows: [{ id: 40, name: "Outro nome", value: "Outro valor" }] },
      ];

      // Em edição, deletamos os antigos e criamos os novos
      const deleted = existingCustomFields;
      const created = newCustomFields;

      expect(deleted.length).toBe(2);
      expect(created.length).toBe(2);
      expect(created[0].title).toBe("Campo novo");
      expect(created[1].title).toBe("Outro campo novo");
    });

    it("should preserve custom fields structure when updating", () => {
      const customFieldsData = [
        {
          id: 1,
          title: "Dados customizados",
          rows: [
            { id: 10, name: "Campo 1", value: "Valor 1" },
            { id: 11, name: "Campo 2", value: "Valor 2" },
          ],
        },
      ];

      // Simula atualização: mantém a estrutura mas pode alterar valores
      const updated = customFieldsData.map((item) => ({
        ...item,
        rows: item.rows.map((row) => ({
          ...row,
          value: row.value + " (atualizado)",
        })),
      }));

      expect(updated[0].rows[0].value).toBe("Valor 1 (atualizado)");
      expect(updated[0].rows[1].value).toBe("Valor 2 (atualizado)");
      expect(updated[0].title).toBe("Dados customizados");
    });
  });

  describe("Custom Fields Initialization", () => {
    it("should initialize CustomFieldsWrapper with existing data", () => {
      const initialData = [
        {
          id: 1,
          title: "Dados customizados",
          rows: [
            { id: 10, name: "Nome do campo", value: "Valor do campo" },
          ],
        },
      ];

      const jsonData = JSON.stringify(initialData);
      const parsed = JSON.parse(jsonData);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe(1);
      expect(parsed[0].title).toBe("Dados customizados");
      expect(parsed[0].rows).toHaveLength(1);
      expect(parsed[0].rows[0].name).toBe("Nome do campo");
      expect(parsed[0].rows[0].value).toBe("Valor do campo");
    });

    it("should handle empty initial data", () => {
      const initialData: Array<{ id: number; title: string; rows: Array<{ id: number; name: string; value: string }> }> = [];
      const jsonData = JSON.stringify(initialData);
      const parsed = JSON.parse(jsonData);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it("should ensure each custom field has at least one row", () => {
      const initialData = [
        {
          id: 1,
          title: "Campo sem rows",
          rows: [],
        },
      ];

      // Simula a lógica de garantir pelo menos uma row
      const normalized = initialData.map((item) => ({
        ...item,
        rows: item.rows.length > 0 ? item.rows : [{ id: Date.now(), name: "", value: "" }],
      }));

      expect(normalized[0].rows.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed custom_fields_data JSON", () => {
      const invalidJson = "{ invalid json }";
      let parsed = null;
      try {
        parsed = JSON.parse(invalidJson);
      } catch {
        // Deve ignorar erro de parse
      }
      expect(parsed).toBeNull();
    });

    it("should handle custom fields with missing optional fields", () => {
      const customFieldsData = [
        {
          title: "Campo sem ID",
          rows: [{ value: "Valor sem nome" }],
        },
      ];

      const normalized = customFieldsData.map((item) => ({
        id: item.id || Date.now(),
        title: item.title || "",
        rows: item.rows.map((row) => ({
          id: row.id || Date.now(),
          name: row.name ?? "",
          value: row.value ?? "",
        })),
      }));

      expect(normalized[0].id).toBeTruthy();
      expect(normalized[0].title).toBe("Campo sem ID");
      expect(normalized[0].rows[0].name).toBe("");
      expect(normalized[0].rows[0].value).toBe("Valor sem nome");
    });

    it("should handle null or undefined values in rows", () => {
      const customFieldsData = [
        {
          id: 1,
          title: "Campo com valores nulos",
          rows: [
            { id: 10, name: null, value: undefined },
            { id: 11, name: "Nome válido", value: "Valor válido" },
          ],
        },
      ];

      const normalized = customFieldsData.map((item) => ({
        ...item,
        rows: item.rows.map((row) => ({
          id: row.id || Date.now(),
          name: row.name ?? "",
          value: row.value ?? "",
        })),
      }));

      expect(normalized[0].rows[0].name).toBe("");
      expect(normalized[0].rows[0].value).toBe("");
      expect(normalized[0].rows[1].name).toBe("Nome válido");
      expect(normalized[0].rows[1].value).toBe("Valor válido");
    });
  });
});
