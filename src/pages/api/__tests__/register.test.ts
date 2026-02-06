/**
 * Testes do endpoint /api/register (cadastro via better-auth email-password).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/auth.ts", () => ({
  auth: {
    handler: vi.fn(),
  },
}));

const { auth } = await import("../../../lib/auth.ts");

/** locals com rate limit alto para não bloquear testes em sequência */
const testLocals = {
  runtime: {
    env: { RATE_LIMIT_REGISTER_MAX: "100", RATE_LIMIT_REGISTER_WINDOW_MIN: "60" } as Record<string, string>,
  },
};

describe("register API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects with missing_fields when name is empty", async () => {
    const { POST } = await import("../register.ts");
    const formData = new FormData();
    formData.set("name", "");
    formData.set("email", "test@example.com");
    formData.set("password", "password1234");
    formData.set("locale", "pt-br");

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        Array.from(formData.entries()) as [string, string][]
      ).toString(),
    });

    const redirect = vi.fn((url: string) => new Response(null, { status: 303, headers: { Location: url } }));
    await POST({
      request,
      redirect,
      locals: testLocals,
    } as Parameters<typeof POST>[0]);

    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining("error=missing_fields"),
      303
    );
  });

  it("redirects with password_too_short when password is under 8 chars", async () => {
    const { POST } = await import("../register.ts");
    const formData = new FormData();
    formData.set("name", "Test User");
    formData.set("email", "test@example.com");
    formData.set("password", "short");
    formData.set("locale", "pt-br");

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        Array.from(formData.entries()) as [string, string][]
      ).toString(),
    });

    const redirect = vi.fn((url: string) => new Response(null, { status: 303, headers: { Location: url } }));
    await POST({
      request,
      redirect,
      locals: testLocals,
    } as Parameters<typeof POST>[0]);

    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining("error=password_too_short"),
      303
    );
  });

  it("calls auth.handler with sign-up payload when form is valid", async () => {
    const mockHandler = vi.mocked(auth.handler);
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1", email: "test@example.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { POST } = await import("../register.ts");
    const formData = new FormData();
    formData.set("name", "Test User");
    formData.set("email", "test@example.com");
    formData.set("password", "password1234");
    formData.set("locale", "pt-br");

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        Array.from(formData.entries()) as [string, string][]
      ).toString(),
    });

    const redirect = vi.fn((url: string) => new Response(null, { status: 303, headers: { Location: url } }));
    await POST({
      request,
      redirect,
      locals: testLocals,
    } as Parameters<typeof POST>[0]);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const authRequest = mockHandler.mock.calls[0]![0];
    expect(authRequest.url).toContain("/api/auth/sign-up/email");
    expect(authRequest.method).toBe("POST");
    const body = await authRequest.json();
    expect(body).toMatchObject({
      name: "Test User",
      email: "test@example.com",
      password: "password1234",
    });
    expect(body.role).toBe(3); // default when not sent (3 = leitor)
  });

  it("passes role in sign-up payload when provided", async () => {
    const mockHandler = vi.mocked(auth.handler);
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1", email: "admin@example.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { POST } = await import("../register.ts");
    const formData = new FormData();
    formData.set("name", "Admin User");
    formData.set("email", "admin@example.com");
    formData.set("password", "password1234");
    formData.set("role", "0"); // 0 = administrador
    formData.set("locale", "pt-br");

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        Array.from(formData.entries()) as [string, string][]
      ).toString(),
    });

    const redirect = vi.fn((url: string) => new Response(null, { status: 303, headers: { Location: url } }));
    await POST({
      request,
      redirect,
      locals: testLocals,
    } as Parameters<typeof POST>[0]);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const authRequest = mockHandler.mock.calls[0]![0];
    const body = await authRequest.json();
    expect(body).toMatchObject({
      name: "Admin User",
      email: "admin@example.com",
      password: "password1234",
      role: 0,
    });
  });
});
