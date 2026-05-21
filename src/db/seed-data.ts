/**
 * Dados de seed compartilhados entre o seed local (runSeed) e o seed remoto (SQL).
 * Única fonte de verdade para: locales, post types padrão e permissões por perfil.
 * O SQL remoto é gerado por scripts/generate-seed-sql.ts a partir destes dados.
 *
 * Seed só via scripts npm (antes do deploy), nunca por API.
 */

/** Linha para tabela locales. */
export interface LocaleRow {
  locale_code: string;
  language: string;
  hello_world: string;
  country: string;
  timezone: string;
}

/** Linha da tabela role_capability (role_id no DB). */
export interface RoleCapabilityRow {
  roleId: number;
  capability: string;
}

/** Locales necessários para traduções (en_US, es_ES, pt_BR). */
export const REQUIRED_LOCALES: LocaleRow[] = [
  { locale_code: "en_US", language: "English (US)", hello_world: "Hello World", country: "United States", timezone: "UTC-5" },
  { locale_code: "es_ES", language: "Spanish (Spain)", hello_world: "Hola Mundo", country: "Spain", timezone: "UTC+1" },
  { locale_code: "pt_BR", language: "Portuguese (Brazil)", hello_world: "Olá Mundo", country: "Brazil", timezone: "UTC-3" },
];

/** Todos os locales (idiomas/países) + obrigatórios para i18n. Usado no seed e no SQL remoto. */
export const FULL_LOCALES: LocaleRow[] = [
  { language: "English", hello_world: "Hello World", locale_code: "en", country: "United States", timezone: "UTC-5" },
  { language: "English", hello_world: "Hello World", locale_code: "en-GB", country: "United Kingdom", timezone: "UTC+0" },
  { language: "Portuguese", hello_world: "Olá Mundo", locale_code: "pt-BR", country: "Brazil", timezone: "UTC-3" },
  { language: "Portuguese", hello_world: "Olá Mundo", locale_code: "pt-PT", country: "Portugal", timezone: "UTC+0" },
  { language: "Spanish", hello_world: "Hola Mundo", locale_code: "es", country: "Spain", timezone: "UTC+1" },
  { language: "Spanish", hello_world: "Hola Mundo", locale_code: "es-MX", country: "Mexico", timezone: "UTC-6" },
  { language: "French", hello_world: "Bonjour le monde", locale_code: "fr", country: "France", timezone: "UTC+1" },
  { language: "French", hello_world: "Bonjour le monde", locale_code: "fr-CA", country: "Canada", timezone: "UTC-5" },
  { language: "German", hello_world: "Hallo Welt", locale_code: "de", country: "Germany", timezone: "UTC+1" },
  { language: "Italian", hello_world: "Ciao mondo", locale_code: "it", country: "Italy", timezone: "UTC+1" },
  { language: "Japanese", hello_world: "こんにちは世界", locale_code: "ja", country: "Japan", timezone: "UTC+9" },
  { language: "Chinese (Simplified)", hello_world: "你好世界", locale_code: "zh-CN", country: "China", timezone: "UTC+8" },
  { language: "Chinese (Traditional)", hello_world: "你好世界", locale_code: "zh-TW", country: "Taiwan", timezone: "UTC+8" },
  { language: "Russian", hello_world: "Привет мир", locale_code: "ru", country: "Russia", timezone: "UTC+3" },
  { language: "Korean", hello_world: "안녕하세요 세계", locale_code: "ko", country: "South Korea", timezone: "UTC+9" },
  { language: "Arabic", hello_world: "مرحبا بالعالم", locale_code: "ar", country: "Saudi Arabia", timezone: "UTC+3" },
  { language: "Dutch", hello_world: "Hallo wereld", locale_code: "nl", country: "Netherlands", timezone: "UTC+1" },
  { language: "Polish", hello_world: "Witaj świecie", locale_code: "pl", country: "Poland", timezone: "UTC+1" },
  { language: "Turkish", hello_world: "Merhaba Dünya", locale_code: "tr", country: "Turkey", timezone: "UTC+3" },
  { language: "Vietnamese", hello_world: "Xin chào thế giới", locale_code: "vi", country: "Vietnam", timezone: "UTC+7" },
  { language: "Hindi", hello_world: "नमस्ते दुनिया", locale_code: "hi", country: "India", timezone: "UTC+5:30" },
  { language: "Thai", hello_world: "สวัสดีชาวโลก", locale_code: "th", country: "Thailand", timezone: "UTC+7" },
  { language: "Indonesian", hello_world: "Halo Dunia", locale_code: "id", country: "Indonesia", timezone: "UTC+7" },
  { language: "Hebrew", hello_world: "שלום עולם", locale_code: "he", country: "Israel", timezone: "UTC+2" },
  { language: "Greek", hello_world: "Γεια σου κόσμε", locale_code: "el", country: "Greece", timezone: "UTC+2" },
  { language: "Swedish", hello_world: "Hej världen", locale_code: "sv", country: "Sweden", timezone: "UTC+1" },
  { language: "Norwegian", hello_world: "Hei verden", locale_code: "no", country: "Norway", timezone: "UTC+1" },
  { language: "Danish", hello_world: "Hej verden", locale_code: "da", country: "Denmark", timezone: "UTC+1" },
  { language: "Finnish", hello_world: "Hei maailma", locale_code: "fi", country: "Finland", timezone: "UTC+2" },
  { language: "Czech", hello_world: "Ahoj světe", locale_code: "cs", country: "Czech Republic", timezone: "UTC+1" },
  { language: "Romanian", hello_world: "Salut Lume", locale_code: "ro", country: "Romania", timezone: "UTC+2" },
  { language: "Hungarian", hello_world: "Helló Világ", locale_code: "hu", country: "Hungary", timezone: "UTC+1" },
  { language: "Ukrainian", hello_world: "Привіт Світ", locale_code: "uk", country: "Ukraine", timezone: "UTC+2" },
  { language: "Bulgarian", hello_world: "Здравей свят", locale_code: "bg", country: "Bulgaria", timezone: "UTC+2" },
  { language: "Croatian", hello_world: "Pozdrav svijete", locale_code: "hr", country: "Croatia", timezone: "UTC+1" },
  { language: "Serbian", hello_world: "Здраво свете", locale_code: "sr", country: "Serbia", timezone: "UTC+1" },
  { language: "Slovak", hello_world: "Ahoj svet", locale_code: "sk", country: "Slovakia", timezone: "UTC+1" },
  { language: "Slovenian", hello_world: "Pozdravljen svet", locale_code: "sl", country: "Slovenia", timezone: "UTC+1" },
  ...REQUIRED_LOCALES,
];

/** Permissões por perfil: 0=admin, 1=editor, 2=autor, 3=leitor. */
export const ROLE_CAPABILITY_ROWS: RoleCapabilityRow[] = [
  { roleId: 0, capability: "*" },
  { roleId: 1, capability: "admin.dashboard" },
  { roleId: 1, capability: "admin.content" },
  { roleId: 1, capability: "admin.list" },
  { roleId: 1, capability: "admin.media" },
  { roleId: 1, capability: "action.delete" },
  { roleId: 1, capability: "menu.full" },
  { roleId: 2, capability: "admin.dashboard" },
  { roleId: 2, capability: "admin.content" },
  { roleId: 2, capability: "admin.list" },
  { roleId: 2, capability: "admin.media" },
  { roleId: 2, capability: "menu.full" },
  { roleId: 3, capability: "admin.dashboard" },
];

/** Configuração do post de menu por post type (post inicial com show_in_menu). Mesma estrutura do seed.ts. */
export interface MenuConfigRow {
  typeSlug: string;
  menu_options: string[];
  menu_order: number;
  icon: string;
}

/** Linha de seed para taxonomies. parent_slug referencia slug de outra taxonomy (ordem da lista importa). */
export interface TaxonomySeedRow {
  name: string;
  slug: string;
  type: string;
  parent_slug: string | null;
}

/** Taxonomias padrão: Categoria (raiz), Uncategorized (filha de categoria), Tag (raiz). Mesma estrutura do seed.ts. */
export const TAXONOMY_SEED_ROWS: TaxonomySeedRow[] = [
  { name: "Categoria", slug: "categoria", type: "category", parent_slug: null },
  { name: "Uncategorized", slug: "uncategorized", type: "category", parent_slug: "categoria" },
  { name: "Tag", slug: "tag", type: "tag", parent_slug: null },
];

export const MENU_CONFIG: MenuConfigRow[] = [
  { typeSlug: "dashboard", menu_options: ["dashboard"], menu_order: 1, icon: "line-md:home" },
  {
    typeSlug: "post",
    menu_options: ["list", "new", "taxonomies_type_category", "taxonomies_type_tag"],
    menu_order: 2,
    icon: "line-md:document",
  },
  { typeSlug: "page", menu_options: ["list", "new"], menu_order: 3, icon: "line-md:list" },
  { typeSlug: "settings", menu_options: ["post_types", "list", "new", "cache"], menu_order: 4, icon: "line-md:cog" },
  { typeSlug: "user", menu_options: ["list", "new"], menu_order: 5, icon: "line-md:account" },
  { typeSlug: "attachment", menu_options: ["list", "new"], menu_order: 6, icon: "line-md:cloud-alt-upload-loop" },
  { typeSlug: "translations_languages", menu_options: ["list", "new"], menu_order: 7, icon: "line-md:chat-round-dots" },
  { typeSlug: "themes", menu_options: ["list", "new"], menu_order: 8, icon: "line-md:paint-drop-twotone" },
];

/** Post types padrão (slug, name, meta_schema). Re-exportado de default-post-types para centralizar dados de seed. */
export { DEFAULT_POST_TYPES, META_ONLY_POST_TYPE_SLUGS } from "./default-post-types.ts";
export type { DefaultPostTypeRow } from "./default-post-types.ts";
