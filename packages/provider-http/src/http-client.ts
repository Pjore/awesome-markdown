import {
  BoardSchema,
  AxisSchema,
  BoardRenderSchema,
  HomelessSchema,
  ItemSchema,
  DeleteResponseSchema,
  ErrorResponseSchema,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
} from '@awesome-markdown/contracts';
import type {
  Board,
  Axis,
  BoardRender,
  Homeless,
  Item,
  CreateItemRequest,
  PatchItemRequest,
} from '@awesome-markdown/contracts';
import { z } from 'zod';
import { endpoints } from './endpoints.js';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type FetchFn = typeof fetch;

export interface HttpClientConfig {
  baseUrl: string;
  fetchFn?: FetchFn;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function parseErrorBody(res: Response): Promise<ProviderHttpError> {
  let body: unknown;
  try {
    body = await res.json() as unknown;
  } catch {
    body = null;
  }
  const parsed = ErrorResponseSchema.safeParse(body);
  const message = parsed.success ? parsed.data.error : `HTTP ${res.status}`;
  return new ProviderHttpError(res.status, body, message);
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
} as const;

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export class SidecarHttpClient {
  private readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(config: HttpClientConfig) {
    this.base = config.baseUrl.replace(/\/$/, '');
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private async req<T>(
    url: string,
    init: RequestInit,
    parse: (raw: unknown) => T,
  ): Promise<T> {
    const res = await this.fetchFn(url, {
      ...init,
      headers: { ...JSON_HEADERS, ...init.headers },
    });
    if (!res.ok) throw await parseErrorBody(res);
    return parse(await res.json() as unknown);
  }

  // -- Health ----------------------------------------------------------------

  async health(signal?: AbortSignal): Promise<void> {
    const res = await this.fetchFn(endpoints.health(this.base), { signal });
    if (!res.ok) throw await parseErrorBody(res);
  }

  // -- Boards ----------------------------------------------------------------

  async listBoards(signal?: AbortSignal): Promise<Board[]> {
    return this.req(
      endpoints.boards(this.base),
      { method: 'GET', signal },
      (d) => z.array(BoardSchema).parse(d),
    );
  }

  async getBoard(slug: string, signal?: AbortSignal): Promise<Board | null> {
    try {
      return await this.req(
        `${endpoints.boards(this.base)}/${slug}`,
        { method: 'GET', signal },
        (d) => BoardSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  // -- Axes ------------------------------------------------------------------

  async listAxes(signal?: AbortSignal): Promise<Axis[]> {
    return this.req(
      endpoints.axes(this.base),
      { method: 'GET', signal },
      (d) => z.array(AxisSchema).parse(d),
    );
  }

  async getAxis(slug: string, signal?: AbortSignal): Promise<Axis | null> {
    try {
      return await this.req(
        `${endpoints.axes(this.base)}/${slug}`,
        { method: 'GET', signal },
        (d) => AxisSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  // -- Render / Homeless -----------------------------------------------------

  async getBoardRender(slug: string, signal?: AbortSignal): Promise<BoardRender> {
    return this.req(
      endpoints.boardRender(this.base, slug),
      { method: 'GET', signal },
      (d) => BoardRenderSchema.parse(d),
    );
  }

  async getHomeless(boardSlug: string, signal?: AbortSignal): Promise<Homeless> {
    return this.req(
      endpoints.boardHomeless(this.base, boardSlug),
      { method: 'GET', signal },
      (d) => HomelessSchema.parse(d),
    );
  }

  // -- Items -----------------------------------------------------------------

  async getItem(slug: string, signal?: AbortSignal): Promise<Item | null> {
    try {
      return await this.req(
        endpoints.item(this.base, slug),
        { method: 'GET', signal },
        (d) => ItemSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async createItem(req: CreateItemRequest, signal?: AbortSignal): Promise<Item> {
    return this.req(
      endpoints.items(this.base),
      { method: 'POST', body: JSON.stringify(CreateItemRequestSchema.parse(req)), signal },
      (d) => ItemSchema.parse(d),
    );
  }

  async patchItem(slug: string, req: PatchItemRequest, signal?: AbortSignal): Promise<Item> {
    return this.req(
      endpoints.item(this.base, slug),
      { method: 'PATCH', body: JSON.stringify(PatchItemRequestSchema.parse(req)), signal },
      (d) => ItemSchema.parse(d),
    );
  }

  async deleteItem(slug: string, signal?: AbortSignal): Promise<void> {
    await this.req(
      endpoints.item(this.base, slug),
      { method: 'DELETE', signal },
      (d) => DeleteResponseSchema.parse(d),
    );
  }
}

