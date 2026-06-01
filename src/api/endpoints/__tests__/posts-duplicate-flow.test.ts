import { describe, it, expect } from "vitest";

describe("Post duplicate flow - relations & custom fields", () => {
  describe("Duplicate main post title & slug", () => {
    it("should generate incremented title and slug for duplicate", () => {
      const baseTitle = "Post Original";
      const baseSlug = "post-original";

      // Simula a lógica de incremento usada no endpoint /api/posts/[id]/duplicate
      function getNextTitleAndSlug(existingSlugs: string[]) {
        let counter = 1;
        let newTitle = baseTitle;
        let newSlug = baseSlug;
        let slugExists = true;

        while (slugExists) {
          newTitle = `${baseTitle} ${counter}`;
          newSlug = `${baseSlug}-${counter}`;
          slugExists = existingSlugs.includes(newSlug);
          if (slugExists) counter++;
        }

        return { newTitle, newSlug };
      }

      const existingSlugs = ["post-original-1", "post-original-2"];
      const { newTitle, newSlug } = getNextTitleAndSlug(existingSlugs);

      expect(newTitle).toBe("Post Original 3");
      expect(newSlug).toBe("post-original-3");
    });
  });

  describe("Duplicate relations (taxonomies, media, custom fields)", () => {
    it("should copy taxonomy and media relations to the new post id", () => {
      const originalPostId = 10;
      const newPostId = 20;

      const taxonomyRelations = [
        { term_id: 1 },
        { term_id: 2 },
      ];

      const mediaRelations = [
        { media_id: 100 },
        { media_id: 200 },
      ];

      // Simula o mapeamento feito no endpoint
      const duplicatedTaxRelations = taxonomyRelations.map((rel) => ({
        post_id: newPostId,
        term_id: rel.term_id,
      }));

      const duplicatedMediaRelations = mediaRelations.map((rel) => ({
        post_id: newPostId,
        media_id: rel.media_id,
      }));

      expect(duplicatedTaxRelations).toEqual([
        { post_id: newPostId, term_id: 1 },
        { post_id: newPostId, term_id: 2 },
      ]);

      expect(duplicatedMediaRelations).toEqual([
        { post_id: newPostId, media_id: 100 },
        { post_id: newPostId, media_id: 200 },
      ]);
    });

    it("should duplicate custom fields with updated parent_id and preserved meta_values", () => {
      const originalPostId = 10;
      const newPostId = 20;

      const now = 1700000000000;

      const customFieldsPosts = [
        {
          id: 1,
          post_type_id: 99,
          parent_id: originalPostId,
          author_id: "user-1",
          id_locale_code: 1,
          title: "Campo 1",
          slug: "campo-1",
          excerpt: "",
          body: "",
          status: "published",
          meta_values: JSON.stringify({
            fields: [
              { name: "label", value: "Nome" },
              { name: "type", value: "text" },
            ],
            template: false,
          }),
          published_at: now,
          created_at: now,
          updated_at: now,
        },
      ];

      // Simula a parte relevante da lógica do endpoint /api/posts/[id]/duplicate
      const generatedSlug = "campo-1-xyz"; // slug único qualquer

      const duplicatedCustomFields = customFieldsPosts.map((cfPost) => ({
        post_type_id: cfPost.post_type_id,
        parent_id: newPostId,
        author_id: cfPost.author_id,
        id_locale_code: cfPost.id_locale_code,
        title: cfPost.title,
        slug: generatedSlug,
        excerpt: cfPost.excerpt,
        body: cfPost.body,
        status: cfPost.status,
        meta_values: cfPost.meta_values,
        published_at: cfPost.published_at,
        created_at: now,
        updated_at: now,
      }));

      expect(duplicatedCustomFields).toHaveLength(1);
      const duplicated = duplicatedCustomFields[0];

      expect(duplicated.parent_id).toBe(newPostId);
      expect(duplicated.title).toBe("Campo 1");
      expect(duplicated.slug).toBe(generatedSlug);

      // Garante que os meta_values (incluindo rows) foram preservados
      expect(duplicated.meta_values).toBe(customFieldsPosts[0].meta_values);
      const parsedOriginal = JSON.parse(customFieldsPosts[0].meta_values);
      const parsedDuplicated = JSON.parse(duplicated.meta_values);
      expect(parsedDuplicated).toEqual(parsedOriginal);
    });
  });
});

describe("Edit duplicated post - custom fields preservation", () => {
  it("should serialize all custom field rows into meta_values when saving", () => {
    const status = "published";
    const localeId = 1;

    const customFieldsItems = [
      {
        id: 1,
        title: "Grupo 1",
        rows: [
          { id: 101, name: "label", value: "Nome" },
          { id: 102, name: "type", value: "text" },
        ],
        template: false,
      },
      {
        id: 2,
        title: "Grupo 2",
        rows: [
          { id: 201, name: "label", value: "Descrição" },
          { id: 202, name: "type", value: "textarea" },
        ],
        template: true,
      },
    ];

    // Simula o trecho de /api/posts.ts que monta meta_values para cada custom field
    const payloads = customFieldsItems.map((item) => {
      const slugBase = item.title.toLowerCase().replace(/\s+/g, "-");
      const slug = slugBase || "custom-field";
      const template = item.template === true;
      const metaValuesStr =
        item.rows?.length > 0
          ? JSON.stringify({
              fields: item.rows.map((r) => ({
                name: r.name ?? "",
                value: r.value ?? "",
              })),
              template,
            })
          : JSON.stringify({ template });

      return {
        post_type_id: "custom_fields",
        parent_id: 999, // id do post pai qualquer
        title: (item.title || "").trim() || "Custom field",
        slug,
        status,
        author_id: "user-1",
        id_locale_code: localeId,
        meta_values: metaValuesStr,
      };
    });

    expect(payloads).toHaveLength(2);

    const first = JSON.parse(payloads[0].meta_values);
    const second = JSON.parse(payloads[1].meta_values);

    // Garante que todas as linhas foram preservadas para o post duplicado ao salvar
    expect(first.fields).toEqual([
      { name: "label", value: "Nome" },
      { name: "type", value: "text" },
    ]);
    expect(first.template).toBe(false);

    expect(second.fields).toEqual([
      { name: "label", value: "Descrição" },
      { name: "type", value: "textarea" },
    ]);
    expect(second.template).toBe(true);
  });
});

describe("Duplicate + Edit flow - end-to-end custom fields preservation", () => {
  it("should preserve all custom field rows through duplicate -> load -> edit -> save cycle", () => {
    // ===== ETAPA 1: DUPLICAÇÃO =====
    // Simula o que acontece em /api/posts/[id]/duplicate.ts
    const originalPostId = 10;
    const newPostId = 20;
    const now = 1700000000000;

    // Custom fields originais do post
    const originalCustomFields = [
      {
        id: 1,
        post_type_id: 99,
        parent_id: originalPostId,
        title: "Grupo de Campos",
        slug: "grupo-de-campos",
        meta_values: JSON.stringify({
          fields: [
            { name: "label", value: "Nome Completo" },
            { name: "type", value: "text" },
            { name: "required", value: "true" },
            { name: "placeholder", value: "Digite seu nome" },
          ],
          template: false,
        }),
      },
      {
        id: 2,
        post_type_id: 99,
        parent_id: originalPostId,
        title: "Grupo de Endereço",
        slug: "grupo-de-endereco",
        meta_values: JSON.stringify({
          fields: [
            { name: "label", value: "Rua" },
            { name: "type", value: "text" },
            { name: "label", value: "Cidade" },
            { name: "type", value: "text" },
          ],
          template: true,
        }),
      },
    ];

    // Duplicar custom fields (como em duplicate.ts)
    const duplicatedCustomFields = originalCustomFields.map((cfPost) => ({
      ...cfPost,
      parent_id: newPostId, // Atualiza parent_id para o novo post
      slug: `${cfPost.slug}-${Date.now()}`, // Gera slug único
      meta_values: cfPost.meta_values, // Preserva meta_values intacto
    }));

    // Verificar que duplicação preservou tudo
    expect(duplicatedCustomFields).toHaveLength(2);
    expect(duplicatedCustomFields[0].parent_id).toBe(newPostId);
    expect(duplicatedCustomFields[1].parent_id).toBe(newPostId);

    // ===== ETAPA 2: CARREGAR PARA EDIÇÃO =====
    // Simula o que acontece em content.astro quando carrega custom fields para edição
    const loadedCustomFields = duplicatedCustomFields.map((cfPost) => {
      let rows: Array<{ id: number; name: string; value: string }> = [];
      let template = false;

      if (cfPost.meta_values) {
        try {
          const meta = JSON.parse(cfPost.meta_values) as {
            fields?: Array<{ name?: string; value?: string }>;
            template?: boolean;
          };
          if (meta.fields && Array.isArray(meta.fields)) {
            let rowIdCounter = Date.now();
            rows = meta.fields.map((field) => {
              rowIdCounter += 1;
              return {
                id: rowIdCounter,
                name: typeof field.name === "string" ? field.name : "",
                value: typeof field.value === "string" ? field.value : "",
              };
            });
          }
          if (meta.template === true) template = true;
        } catch {
          // Se não conseguir parsear, usar array vazio
        }
      }

      return {
        id: cfPost.id,
        title: cfPost.title || "",
        rows,
        template,
      };
    });

    // Verificar que todas as rows foram carregadas corretamente
    expect(loadedCustomFields[0].rows).toHaveLength(4); // 4 campos no primeiro grupo
    expect(loadedCustomFields[1].rows).toHaveLength(4); // 4 campos no segundo grupo
    expect(loadedCustomFields[0].rows[0].name).toBe("label");
    expect(loadedCustomFields[0].rows[0].value).toBe("Nome Completo");

    // ===== ETAPA 3: SIMULAR EDIÇÃO =====
    // Simula o usuário editando alguns valores (como no frontend)
    const editedCustomFields = loadedCustomFields.map((item) => ({
      ...item,
      rows: item.rows.map((row) => {
        // Simula edição: altera alguns valores
        if (row.name === "label" && row.value === "Nome Completo") {
          return { ...row, value: "Nome Completo (Editado)" };
        }
        return row;
      }),
    }));

    // Verificar que a edição foi aplicada
    expect(editedCustomFields[0].rows[0].value).toBe("Nome Completo (Editado)");

    // ===== ETAPA 4: SALVAR APÓS EDIÇÃO =====
    // Simula o que acontece em /api/posts.ts quando salva custom fields
    const customFieldsToSave = editedCustomFields
      .filter((item) => !item._deleted) // Remove campos marcados para deleção
      .map((item) => ({
        ...item,
        rows: item.rows.filter((row) => !row._deleted), // Remove rows marcadas para deleção
        template: item.template === true,
      }))
      .filter((item) => item.rows.length > 0); // Remove custom fields sem rows

    // Serializar para meta_values (como em posts.ts)
    const savedCustomFields = customFieldsToSave.map((item) => {
      const template = item.template === true;
      const metaValuesStr =
        item.rows?.length > 0
          ? JSON.stringify({
              fields: item.rows.map((r) => ({
                name: r.name ?? "",
                value: r.value ?? "",
              })),
              template,
            })
          : JSON.stringify({ template });

      return {
        title: item.title,
        meta_values: metaValuesStr,
      };
    });

    // ===== ETAPA 5: VERIFICAR PRESERVAÇÃO COMPLETA =====
    expect(savedCustomFields).toHaveLength(2); // Ambos os grupos devem estar presentes

    const firstSaved = JSON.parse(savedCustomFields[0].meta_values);
    const secondSaved = JSON.parse(savedCustomFields[1].meta_values);

    // Verificar que TODAS as rows foram preservadas (incluindo a edição)
    expect(firstSaved.fields).toHaveLength(4); // Todas as 4 rows originais
    expect(firstSaved.fields[0]).toEqual({
      name: "label",
      value: "Nome Completo (Editado)", // Valor editado preservado
    });
    expect(firstSaved.fields[1]).toEqual({ name: "type", value: "text" });
    expect(firstSaved.fields[2]).toEqual({ name: "required", value: "true" });
    expect(firstSaved.fields[3]).toEqual({
      name: "placeholder",
      value: "Digite seu nome",
    });

    expect(secondSaved.fields).toHaveLength(4); // Todas as 4 rows originais
    expect(secondSaved.template).toBe(true);

    // Verificar que nenhuma row foi perdida durante o ciclo completo
    const totalOriginalRows =
      JSON.parse(originalCustomFields[0].meta_values).fields.length +
      JSON.parse(originalCustomFields[1].meta_values).fields.length;
    const totalSavedRows = firstSaved.fields.length + secondSaved.fields.length;

    expect(totalSavedRows).toBe(totalOriginalRows); // Nenhuma row foi perdida
  });

  it("should handle empty rows array gracefully during edit cycle", () => {
    // Simula um custom field que foi carregado mas ficou sem rows (edge case)
    const customFieldWithEmptyRows = {
      id: 1,
      title: "Campo Vazio",
      rows: [] as Array<{ id: number; name: string; value: string }>,
      template: false,
    };

    // Ao salvar, custom fields sem rows devem ser filtrados
    const customFieldsToSave = [customFieldWithEmptyRows]
      .filter((item) => !item._deleted)
      .map((item) => ({
        ...item,
        rows: item.rows.filter((row) => !row._deleted),
        template: item.template === true,
      }))
      .filter((item) => item.rows.length > 0); // Remove custom fields sem rows

    expect(customFieldsToSave).toHaveLength(0); // Campo sem rows é removido
  });

  it("should preserve custom fields even when some rows are marked as deleted", () => {
    // Simula um custom field onde algumas rows foram marcadas para deleção
    const customFieldWithDeletedRows = {
      id: 1,
      title: "Grupo com Rows Deletadas",
      rows: [
        { id: 1, name: "label", value: "Campo 1", _deleted: false },
        { id: 2, name: "type", value: "text", _deleted: true }, // Marcado para deleção
        { id: 3, name: "label", value: "Campo 2", _deleted: false },
      ],
      template: false,
    };

    // Ao salvar, rows marcadas como _deleted devem ser filtradas
    const customFieldsToSave = [customFieldWithDeletedRows]
      .filter((item) => !item._deleted)
      .map((item) => ({
        ...item,
        rows: item.rows.filter((row) => !(row as any)._deleted), // Remove rows deletadas
        template: item.template === true,
      }))
      .filter((item) => item.rows.length > 0);

    expect(customFieldsToSave).toHaveLength(1);
    expect(customFieldsToSave[0].rows).toHaveLength(2); // Apenas 2 rows restantes
    expect(customFieldsToSave[0].rows[0].name).toBe("label");
    expect(customFieldsToSave[0].rows[0].value).toBe("Campo 1");
    expect(customFieldsToSave[0].rows[1].name).toBe("label");
    expect(customFieldsToSave[0].rows[1].value).toBe("Campo 2");
  });
});
