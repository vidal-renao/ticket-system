import { describe, expect, it } from "vitest";
import {
  findAuthUserByEmail,
  USER_LOOKUP_PAGE_SIZE,
  USER_LOOKUP_MAX_PAGES,
} from "../../lib/auth-admin-users";

type Row = { id: string; email?: string | null };

/** A stand-in for GoTrue's paginated admin list, recording what it was asked. */
function directory(users: Row[], options: { failOnPage?: number; nullDataOnPage?: number } = {}) {
  const calls: Array<{ page?: number; perPage?: number }> = [];
  const client = {
    auth: {
      admin: {
        listUsers: async (params?: { page?: number; perPage?: number }) => {
          calls.push(params ?? {});
          const page = params?.page ?? 1;
          const perPage = params?.perPage ?? 50;
          if (options.failOnPage === page) {
            return { data: null, error: { message: "connection reset" } };
          }
          if (options.nullDataOnPage === page) {
            return { data: null, error: null };
          }
          return {
            data: { users: users.slice((page - 1) * perPage, page * perPage) },
            error: null,
          };
        },
      },
    },
  };
  return { client, calls };
}

const user = (n: number): Row => ({ id: `id-${n}`, email: `user${n}@example.com` });

describe("finding an existing account by address", () => {
  it("finds one on the first page", async () => {
    const { client } = directory([user(1), user(2), user(3)]);
    const result = await findAuthUserByEmail(client, "user2@example.com");
    expect(result).toEqual({ ok: true, user: { id: "id-2", email: "user2@example.com" } });
  });

  it("reports a definite absence when the directory is exhausted", async () => {
    const { client } = directory([user(1), user(2)]);
    expect(await findAuthUserByEmail(client, "nobody@example.com")).toEqual({
      ok: true,
      user: null,
    });
  });

  it("matches regardless of case on either side", async () => {
    const { client } = directory([{ id: "id-x", email: "Markus.Fehr@Example.COM" }]);
    const result = await findAuthUserByEmail(client, "  markus.fehr@example.com  ");
    expect(result.ok && result.user?.id).toBe("id-x");
  });
});

describe("the page-sized blind spot", () => {
  it("keeps paging until a short page, so an account past the first page is still found", async () => {
    // The original bug: one unpaginated call, so anyone beyond the first page
    // read as free and the invite blew up on the unique index instead.
    const users = Array.from({ length: USER_LOOKUP_PAGE_SIZE * 2 + 5 }, (_, i) => user(i + 1));
    const target = users[USER_LOOKUP_PAGE_SIZE * 2 + 1];
    const { client, calls } = directory(users);

    const result = await findAuthUserByEmail(client, target.email!);

    expect(result).toEqual({ ok: true, user: { id: target.id, email: target.email } });
    expect(calls.length).toBe(3);
    expect(calls.every((c) => c.perPage === USER_LOOKUP_PAGE_SIZE)).toBe(true);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it("stops at the first short page instead of paging forever", async () => {
    const { client, calls } = directory([user(1)]);
    await findAuthUserByEmail(client, "nobody@example.com");
    expect(calls.length).toBe(1);
  });

  it("refuses to answer rather than page without end", async () => {
    // Every page comes back full, so exhaustion is never reached. Returning
    // "not found" here would be the original bug wearing a different hat.
    const users = Array.from(
      { length: USER_LOOKUP_PAGE_SIZE * (USER_LOOKUP_MAX_PAGES + 2) },
      (_, i) => user(i + 1)
    );
    const { client, calls } = directory(users);

    const result = await findAuthUserByEmail(client, "nobody@example.com");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("too_many_users");
    expect(calls.length).toBe(USER_LOOKUP_MAX_PAGES);
  });
});

describe("a lookup that could not be performed is not an empty result", () => {
  it("propagates a driver error instead of reporting the address as free", async () => {
    const { client } = directory([user(1)], { failOnPage: 1 });
    const result = await findAuthUserByEmail(client, "user1@example.com");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("lookup_failed");
    expect(!result.ok && result.message).toBe("connection reset");
  });

  it("treats a missing payload with no error as a failure too", async () => {
    // `const { data } = await listUsers()` made this case indistinguishable
    // from "there are no users", which is how an occupied address got invited.
    const { client } = directory([user(1)], { nullDataOnPage: 1 });
    const result = await findAuthUserByEmail(client, "user1@example.com");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("lookup_failed");
  });

  it("fails on a later page rather than concluding the search early", async () => {
    const users = Array.from({ length: USER_LOOKUP_PAGE_SIZE * 2 }, (_, i) => user(i + 1));
    const { client } = directory(users, { failOnPage: 2 });
    const result = await findAuthUserByEmail(client, "nobody@example.com");
    expect(result.ok).toBe(false);
  });
});
