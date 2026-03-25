import { defineCollection, z } from "astro:content";

const serviceCollection = defineCollection({
  schema: () =>
    z.object({
      order: z.number(),
      category: z.string(),
      title: z.string(),
      image: z.string(),
    }),
});

const teamCollection = defineCollection({
  schema: ({ image }) =>
    z.object({
      order: z.number(),
      name: z.string(),
      founder: z.boolean().optional(),
      socials: z.array(z.string()).optional(),
      job: z.string(),
      image: image().refine((img) => img.width >= 100, {
        message: "Cover image must be at least 1080 pixels wide!",
      }),
    }),
});

const portfolioCollection = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      publishedAt: z.number(),
      image: image().refine((img) => img.width >= 100, {
        message: "Cover image must be at least 1080 pixels wide!",
      }),
      jobDescription: z.array(
        z.object({
          title: z.string().optional(),
          category: z.string().optional(),
          tags: z.string().optional(),
          body: z.string().optional(),
          images: z
            .array(
              image().refine((img) => img.width >= 100, {
                message: "Cover image must be at least 1080 pixels wide!",
              })
            )
            .optional(),
          video: z
            .array(
              z.object({
                url: z.string().optional(),
                ori: z.string().optional(),
              })
            )
            .or(z.string())
            .optional(),
        })
      ),
      FichaTec: z
        .array(
          z.object({
            Direction: z.string().optional(),
            Writing: z.string().optional(),
            Direção: z.string().optional(),
            Roteiro: z.string().optional(),
            Distribuição: z.string().optional(),
            Produção: z.string().optional(),
            "Roteirista-chefe": z.string().optional(),
            "Head writer": z.string().optional(),
            "Produção e Criação": z.string().optional(),
            Producer: z.string().optional(),
            Starring: z.string().optional(),
            "Executive Producer": z.string().optional(),
            "Produção Executiva": z.string().optional(),
            "Roteiro ": z.string().optional(),
            "Executive Production": z.string().optional(),
            Production: z.string().optional(),
            "Production Manager": z.string().optional(),
            "Post Production": z.string().optional(),
            Editor: z.string().optional(),
            "Gestão de Projetos": z.string().optional(),
            Edição: z.string().optional(),
            "Design e Arte": z.string().optional(),
            "Pós-produção": z.string().optional(),
            "Produção e Produção Executiva": z.string().optional(),
            Produtora: z.string().optional(),
            "Creation and writing": z.string().optional(),
            "Production Director": z.string().optional(),
            "Project Management": z.string().optional(),
            "Roteiro e Criação": z.string().optional(),
            "Direção de Produção": z.string().optional(),
            "Diretora de Produção": z.string().optional(),
            "Produção ": z.string().optional(),
            "Production and creation": z.string().optional(),
            Estrelando: z.string().optional(),
            Criação: z.string().optional(),
            "Coordenação de Produção": z.string().optional(),
            "Gestão de Projeto": z.string().optional(),
            Arte: z.string().optional(),
            Director: z.string().optional(),
            Apresentação: z.string().optional(),
            "Coordenadora de Casting": z.string().optional(),
            "Assistente de Casting": z.string().optional(),
            "Coordenador de pós:": z.string().optional(),
            "Assistente de Produção": z.string().optional(),
            Financeiro: z.string().optional(),
            "Midias Sociais": z.string().optional(),
            Apresentador: z.string().optional(),
            Humoristas: z.string().optional(),
            Casting: z.string().optional(),
            "Coordenação de Pós Produção": z.string().optional(),
            "Direção de produção": z.string().optional(),
            "Assistência de Direção": z.string().optional(),
            "Direção Geral": z.string().optional(),
            "Direção de Externas": z.string().optional(),
            "Edição ": z.string().optional(),
            Host: z.string().optional(),
            Comedians: z.string().optional(),
            "COLABORAÇÃO DE ROTEIRO": z.string().optional(),
            "Executive Producers": z.string().optional(),
            "Produção executiva": z.string().optional(),
            "Roteiro e argumento": z.string().optional(),
            "Producer Manager ": z.string().optional(),
            "Production Assistant": z.string().optional(),
            "Post-production Coordinator": z.string().optional(),
            "Finance Manager": z.string().optional(),
            "Main Director": z.string().optional(),
            "2nd Unit Directo": z.string().optional(),
            Writers: z.string().optional(),
            Editing: z.string().optional(),
            Art: z.string().optional(),
            "Production and creation:": z.string().optional(),
            "Co-Produção": z.string().optional(),
            "Co-Production": z.string().optional(),
            "Gerente de Projetos": z.string().optional(),
            "Production Coord.": z.string().optional(),
            "Coord. Produção": z.string().optional(),
            "Pós-Produção": z.string().optional(),
            Produtoras: z.string().optional(),
            "Production and Creation": z.string().optional(),
            "Direção ": z.string().optional(),
            Script: z.string().optional(),
            "Creation and Production": z.string().optional(),
            "Chef de Roteiro": z.string().optional(),
            "Mídias Sociais": z.string().optional(),
            "Pós Produção": z.string().optional(),
            Writer: z.string().optional(),
            "Productin Manager": z.string().optional(),
            Edition: z.string().optional(),
            "Social Media": z.string().optional(),
            Finalização: z.string().optional(),
            Montagem: z.string().optional(),
            "Production director": z.string().optional(),
            "Writing and Creation": z.string().optional(),
            "Coord. de Produção": z.string().optional(),
            "Direction and Production": z.string().optional(),
            "Direção e Produção": z.string().optional(),
            "Project Manager": z.string().optional(),
            "Production Coordinator": z.string().optional(),
            Presentation: z.string().optional(),
            Design: z.string().optional(),
            Finishing: z.string().optional(),
            Roteirista: z.string().optional(),
            Montador: z.string().optional(),
            "Assistente de Produção Executiva": z.string().optional(),
            Producers: z.string().optional(),
            "Manager Project": z.string().optional(),
            "Exec Production": z.string().optional(),
            "Artistic production": z.string().optional(),
            "Directed by": z.string().optional(),
            "Production Director  ": z.string().optional(),
            "Produção Artística": z.string().optional(),
            "Roteiro e direção": z.string().optional(),
            "Coordenação de Produção       ": z.string().optional(),
            Distribution: z.string().optional(),
            "Agência Criação": z.string().optional(),
            Creation: z.string().optional(),
            "Head Writer": z.string().optional(),
            "Production and Executive Production": z.string().optional(),
          })
        )
        .optional(),
    }),
});

export const collections = {
  portfoliobr: portfolioCollection,
  portfolioen: portfolioCollection,
  teambr: teamCollection,
  teamen: teamCollection,
  servicosbr: serviceCollection,
  servicosen: serviceCollection,
};
