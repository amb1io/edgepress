/**
 * Re-export do serviço interno de conteúdo (Drizzle + KV).
 * Em cada página: `const content = createEdgepressContent(Astro.locals, { baseUrl: Astro.url.origin });`
 */
export type {
  ContentBySlugParams,
  ContentListParams,
  ContentListResponse,
  ContentPostDetail,
  ContentRowResponse,
  TaxonomiesResponse,
  TaxonomyItem,
} from "../../../../lib/services/edgepress-content.ts";

export { createEdgepressContent, EdgepressContent } from "../../../../lib/services/edgepress-content.ts";
