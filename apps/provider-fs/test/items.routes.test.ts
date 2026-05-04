import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";
import { createServer } from "../src/server.js";
import {
  tmpContentRoot,
  writeItemFixture,
  makeItem,
} from "./fixtures/temp-content.js";
import type { TempContentRoot } from "./fixtures/temp-content.js";
import type { Item } from "@awesome-markdown/contracts";

const BASE_POST = {
  slug: "my-item",
  title: "My Item",
  mutations: [],
};

describe("items routes", () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: "127.0.0.1", contentRoot: tmp.contentRoot });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it("POST /items creates an item and returns 201", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/items",
      headers: { "content-type": "application/json" },
      payload: { ...BASE_POST, body: "Hello world" },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json<Item>();
    expect(item.entityType).toBe("item");
    expect(item.slug).toBe("my-item");
    expect(item.title).toBe("My Item");
    expect(item.body).toBe("Hello world");
    expect(item.createdAt).toBeTruthy();
  });

  it("POST /items — single-file-write invariant", async () => {
    const before = await Array.fromAsync(glob(tmp.contentRoot + "/**/*.md"));
    await server.inject({
      method: "POST",
      url: "/items",
      headers: { "content-type": "application/json" },
      payload: BASE_POST,
    });
    const after = await Array.fromAsync(glob(tmp.contentRoot + "/**/*.md"));
    expect(after.length - before.length).toBe(1);
  });

  it("POST /items — slug collision suffix (-2, -3)", async () => {
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: "clash", title: "Existing" }));
    await server.close();
    server = await createServer({ port: 0, host: "127.0.0.1", contentRoot: tmp.contentRoot });
    await server.ready();

    const r1 = await server.inject({
      method: "POST",
      url: "/items",
      headers: { "content-type": "application/json" },
      payload: { slug: "clash", title: "Clash 1", mutations: [] },
    });
    expect(r1.statusCode).toBe(201);
    expect(r1.json<Item>().slug).toBe("clash-2");

    const r2 = await server.inject({
      method: "POST",
      url: "/items",
      headers: { "content-type": "application/json" },
      payload: { slug: "clash", title: "Clash 2", mutations: [] },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json<Item>().slug).toBe("clash-3");
  });

  it("GET /items/:slug returns the item", async () => {
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: "readable", title: "Readable" }));
    await server.close();
    server = await createServer({ port: 0, host: "127.0.0.1", contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/items/readable" });
    expect(res.statusCode).toBe(200);
    expect(res.json<Item>().slug).toBe("readable");
  });

  it("PATCH /items/:slug applies mutations and only modifies target file", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/items",
      headers: { "content-type": "application/json" },
      payload: { slug: "patch-me", title: "Patch Target", mutations: [] },
    });
    expect(createRes.statusCode).toBe(201);

    const files = await Array.fromAsync(glob(tmp.contentRoot + "/**/*.md"));
    const contentsBefore = new Map<string, string>();
    for (const f of files) {
      contentsBefore.set(f, await readFile(f, "utf-8"));
    }

    const patchRes = await server.inject({
      method: "PATCH",
      url: "/items/patch-me",
      headers: { "content-type": "application/json" },
      payload: { mutations: [{ op: "set", path: "status", value: "done" }] },
    });
    expect(patchRes.statusCode).toBe(200);
    expect((patchRes.json<Record<string, unknown>>())["status"]).toBe("done");

    const filesAfter = await Array.fromAsync(glob(tmp.contentRoot + "/**/*.md"));
    expect(filesAfter).toHaveLength(files.length);
    let changedCount = 0;
    for (const f of filesAfter) {
      const after = await readFile(f, "utf-8");
      if (contentsBefore.get(f) !== after) changedCount++;
    }
    expect(changedCount).toBe(1);
  });

  it("DELETE /items/:slug removes the item", async () => {
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: "del-me", title: "Delete Me" }));
    await server.close();
    server = await createServer({ port: 0, host: "127.0.0.1", contentRoot: tmp.contentRoot });
    await server.ready();

    const del = await server.inject({ method: "DELETE", url: "/items/del-me" });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok: boolean }>().ok).toBe(true);

    const get = await server.inject({ method: "GET", url: "/items/del-me" });
    expect(get.statusCode).toBe(404);
  });

  it("GET /items/:slug returns 404 for unknown item", async () => {
    const res = await server.inject({ method: "GET", url: "/items/nonexistent" });
    expect(res.statusCode).toBe(404);
  });
});
