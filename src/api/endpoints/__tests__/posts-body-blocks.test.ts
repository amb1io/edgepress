/**
 * Testes para persistência de body_blocks no POST /api/posts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthUser = {
  user: { id: "editor-1", role: 2 },
  session: { id: "s1", userId: "editor-1" },
};

const requireMinRoleMock = vi.fn().mockResolvedValue(mockAuthUser);
const createPostMock = vi.fn().mockResolvedValue(42);
const updatePostMock = vi.fn().mockResolvedValue(undefined);
const getPostTypeIdMock = vi.fn().mockResolvedValue(1);
const postExistsMock = vi.fn().mockResolvedValue(true);
const processPostAttachmentsMock = vi.fn().mockResolvedValue(undefined);
const linkPostTaxonomiesMock = vi.fn().mockResolvedValue(undefined);
const syncPostCacheMock = vi.fn().mockResolvedValue(undefined);
const syncPostSearchIndexMock = vi.fn().mockResolvedValue(undefined);
const syncSeoMetadataFromPostSaveMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
  resolveAuthorIdForRole: (requested: string | null, userId: string) => requested ?? userId,
}));

vi.mock("../../../core/services/post-service.ts", () => ({
  createPost: (...args: unknown[]) => createPostMock(...args),
  updatePost: (...args: unknown[]) => updatePostMock(...args),
  getPostTypeId: (...args: unknown[]) => getPostTypeIdMock(...args),
  postExists: (...args: unknown[]) => postExistsMock(...args),
  linkPostTaxonomies: (...args: unknown[]) => linkPostTaxonomiesMock(...args),
  processPostAttachments: (...args: unknown[]) => processPostAttachmentsMock(...args),
  updatePostMetaValues: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../utils/kv-cache-sync.ts", () => ({
  syncPostCache: (...args: unknown[]) => syncPostCacheMock(...args),
  syncThemeCache: vi.fn().mockResolvedValue(undefined),
  syncThemeStatusCacheByPostId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../core/services/search-service.ts", () => ({
  syncPostSearchIndex: (...args: unknown[]) => syncPostSearchIndexMock(...args),
}));

vi.mock("../../../core/services/seo-metadata-service.ts", () => ({
  syncSeoMetadataFromPostSave: (...args: unknown[]) => syncSeoMetadataFromPostSaveMock(...args),
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

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("post_type", "post");
  formData.set("action", "new");
  formData.set("locale", "pt-br");
  formData.set("title", "Título de teste");
  formData.set("slug", "titulo-de-teste");
  formData.set("status", "draft");
  formData.set("body", "<p>HTML do post</p>");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
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

describe("POST /api/posts - body_blocks persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireMinRoleMock.mockResolvedValue(mockAuthUser);
    getPostTypeIdMock.mockResolvedValue(1);
    createPostMock.mockResolvedValue(42);
    updatePostMock.mockResolvedValue(undefined);
    postExistsMock.mockResolvedValue(true);
    mockLocaleLookup();
  });

  it("includes body_blocks in create payload when saving a new post", async () => {
    const blocks = JSON.stringify([
      { id: "block-1", type: "paragraph", content: [{ type: "text", text: "Olá" }] },
    ]);
    const formData = baseFormData({ body_blocks: blocks });

    const response = await callPostsEndpoint(formData);

    expect(response.status).toBe(200);
    expect(createPostMock).toHaveBeenCalledTimes(1);
    const payload = createPostMock.mock.calls[0][1];
    expect(payload.body).toBe("<p>HTML do post</p>");
    expect(payload.body_blocks).toBe(blocks);
  });

  it("includes body_blocks in update payload when editing a post", async () => {
    const blocks = JSON.stringify([
      { id: "block-2", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Título" }] },
    ]);
    const formData = baseFormData({
      action: "edit",
      id: "99",
      body_blocks: blocks,
    });

    const response = await callPostsEndpoint(formData);

    expect(response.status).toBe(200);
    expect(updatePostMock).toHaveBeenCalledTimes(1);
    const payload = updatePostMock.mock.calls[0][3];
    expect(payload.body_blocks).toBe(blocks);
    expect(payload.body).toBe("<p>HTML do post</p>");
  });

  it("stores null when body_blocks is empty", async () => {
    const formData = baseFormData({ body_blocks: "" });

    const response = await callPostsEndpoint(formData);

    expect(response.status).toBe(200);
    const payload = createPostMock.mock.calls[0][1];
    expect(payload.body_blocks).toBeNull();
  });

  it("extracts body_blocks from FormData like the BlockNote editor submits", async () => {
    const formData = new FormData();
    formData.set("post_type", "post");
    formData.set("action", "new");
    formData.set("locale", "pt-br");
    formData.set("title", "Post BlockNote");
    formData.set("slug", "post-blocknote");
    formData.set("status", "published");
    formData.set("body", "<p>Rendered HTML</p>");
    formData.set(
      "body_blocks",
      '[{"id":"a1","type":"paragraph","content":[{"type":"text","text":"BlockNote paragraph"}]}]',
    );

    await callPostsEndpoint(formData);

    const payload = createPostMock.mock.calls[0][1];
    expect(JSON.parse(payload.body_blocks)).toEqual([
      {
        id: "a1",
        type: "paragraph",
        content: [{ type: "text", text: "BlockNote paragraph" }],
      },
    ]);
  });
});
