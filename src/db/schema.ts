// Tables
import { postTypes, postTypeRelations } from "./schema/post_type.ts";
import { posts, postRelations } from "./schema/post.ts";
import { taxonomies, taxonomyRelations } from "./schema/taxonomies.ts";
import { postsTaxonomies, postsTaxonomiesRelations } from "./schema/posts_taxonomies.ts";
import { postsMedia, postsMediaRelations } from "./schema/posts_media.ts";
import { settings } from "./schema/settings.ts";

// Auth
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

// Meta Schema
export { defaultMetaSchema, buildMetaSchema, type MetaSchemaItem } from "./schema/meta_schema.ts";

// Export tables
export { postTypes, posts, taxonomies, postsTaxonomies, postsMedia, settings };

// Export relations
export {
  postTypeRelations,
  postRelations,
  taxonomyRelations,
  postsTaxonomiesRelations,
  postsMediaRelations,
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
