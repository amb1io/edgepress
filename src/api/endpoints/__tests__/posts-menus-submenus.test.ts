/**
 * Testes para persistência de submenus no POST /api/posts (menus CPT)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthUser = {
  user: { id: "editor-1", role: 2 },
  session: { id: "s1", userId: "editor-1" },
};

const requireMinRoleMock = vi.fn().mockResolvedValue(mockAuthUser);
const createPostMock = vi.fn().mockResolvedValue(100);
const updatePostMock = vi.fn().mockResolvedValue(undefined);
const getPostTypeIdMock = vi.fn().mockResolvedValue(7);
const postExistsMock = vi.fn().mockResolvedValue(true);
const persistMenuItemsMock = vi.fn().mockResolvedValue([10, 20]);

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
  resolveAuthorIdForRole: (requested: string | null, userId: string) => requested ?? userId,
}));

vi.mock("../../../core/services/post-service.ts", () => ({
  createPost: (...args: unknown[]) => createPostMock(...args),
  updatePost: (...args: unknown[]) => updatePostMock(...args),
  getPostTypeId: (...args: unknown[]) => getPostTypeIdMock(...args),
  postExists: (...args: unknown[]) => postExistsMock(...args),
  linkPostTaxonomies: vi.fn().mockResolvedValue(undefined),
  processPostAttachments: vi.fn().mockResolvedValue(undefined),
  updatePostMetaValues: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../core/services/menu-items-service.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/services/menu-items-service.ts")>();
  return {
    ...actual,
    persistMenuItems: (...args: unknown[]) => persistMenuItemsMock(...args),
  };
});

vi.mock("../../../utils/kv-cache-sync.ts", () => ({
  syncPostCache: vi.fn().mockResolvedValue(undefined),
  syncThemeCache: vi.fn().mockResolvedValue(undefined),
  syncThemeStatusCacheByPostId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../core/services/search-service.ts", () => ({
  syncPostSearchIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../core/services/seo-metadata-service.ts", () => ({
  syncSeoMetadataFromPostSave: vi.fn().mockResolvedValue(undefined),
}));

const dbSelectMock = vi.fn();

vi.mock("../../../db/index.ts", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

function mockLocaleLookup(localeId = 3): void {
  dbSelectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ id: localeId }]),
      })),
    })),
  });
}

function menusFormData(): FormData {
  const formData = new FormData();
  formData.set("post_type", "menus");
  formData.set("action", "edit");
  formData.set("id", "99");
  formData.set("locale", "pt-br");
  formData.set("title", "Primary");
  formData.set("slug", "primary");
  formData.set("status", "published");
  formData.set(
    "menu_items_data",
    JSON.stringify([
      {
        client_id: "menu-parent",
        label: "Services",
        slug: "services",
        order: 1,
        link_type: "custom",
        custom_url: "/services",
        submenu_sort: "alphabetical",
        submenu_display: ["title", "thumbnail"],
      },
      {
        client_id: "menu-child",
        label: "Design",
        slug: "design",
        order: 2,
        link_type: "post",
        target_post_id: 5,
        target_post_type: "page",
        target_slug: "design",
        target_locale_code: "pt_BR",
        parent_client_id: "menu-parent",
      },
    ]),
  );
  return formData;
}

async function callPostsEndpoint(formData: FormData): Promise<Response> {
  const { POST } = await import("../posts.ts");
  return POST({
    request: new Request("http://localhost/api/posts", {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    }),
    locals: {} as App.Locals,
  });
}

describe("POST /api/posts - menus submenus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireMinRoleMock.mockResolvedValue(mockAuthUser);
    getPostTypeIdMock.mockResolvedValue(7);
    postExistsMock.mockResolvedValue(true);
    persistMenuItemsMock.mockResolvedValue([10, 20]);
    mockLocaleLookup();
  });

  it("passes submenu payload to persistMenuItems", async () => {
    const response = await callPostsEndpoint(menusFormData());

    expect(response.status).toBe(200);
    expect(persistMenuItemsMock).toHaveBeenCalledTimes(1);

    const call = persistMenuItemsMock.mock.calls[0][1] as {
      menuPostId: number;
      items: Array<Record<string, unknown>>;
    };
    expect(call.menuPostId).toBe(99);
    expect(call.items).toHaveLength(2);
    expect(call.items[0]).toMatchObject({
      client_id: "menu-parent",
      submenu_sort: "alphabetical",
      submenu_display: ["title", "thumbnail"],
    });
    expect(call.items[1]).toMatchObject({
      client_id: "menu-child",
      parent_client_id: "menu-parent",
      target_post_id: 5,
      target_slug: "design",
    });
  });
});
