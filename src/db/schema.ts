// Auth first: post ↔ post_type cycle imports auth via post.ts; loading auth after that
// cycle can leave the module undefined in Cloudflare's Vite worker runner.
import {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
  USER_ROLE_IDS,
  USER_ROLE_LABEL_KEYS,
} from "./schema/auth.ts";

// Tables
import { postTypes, postTypeRelations } from "./schema/post_type.ts";
import { posts, postRelations } from "./schema/post.ts";
import { taxonomies, taxonomyRelations } from "./schema/taxonomies.ts";
import { postsTaxonomies, postsTaxonomiesRelations } from "./schema/posts_taxonomies.ts";
import { postsMedia, postsMediaRelations } from "./schema/posts_media.ts";
import { settings } from "./schema/settings.ts";
import { roleCapability } from "./schema/role_capability.ts";
import { locales, localesRelations } from "./schema/locales.ts";
import { translations, translationsRelations } from "./schema/translations.ts";
import { translationsLanguages, translationsLanguagesRelations } from "./schema/translations_languages.ts";

// Meta Schema
export { defaultMetaSchema, buildMetaSchema, type MetaSchemaItem } from "./schema/meta_schema.ts";

// Export tables
export { postTypes, posts, taxonomies, postsTaxonomies, postsMedia, settings, roleCapability, locales, translations, translationsLanguages };

// Export relations
export {
  postTypeRelations,
  postRelations,
  taxonomyRelations,
  postsTaxonomiesRelations,
  postsMediaRelations,
  localesRelations,
  translationsRelations,
  translationsLanguagesRelations,
};

// Export auth
export {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
  USER_ROLE_IDS,
  USER_ROLE_LABEL_KEYS,
};
