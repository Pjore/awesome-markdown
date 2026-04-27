import {
  BoardsListResponseSchema,
  BoardResponseSchema,
  ItemsListResponseSchema,
  ItemResponseSchema,
  ColumnsListResponseSchema,
  ColumnResponseSchema,
  SwimlanesListResponseSchema,
  SwimlaneResponseSchema,
  DeleteResponseSchema,
  ErrorResponseSchema,
} from '@awesome-markdown/contracts';
import type {
  Board,
  Item,
  Column,
  Swimlane,
  CreateBoardInput,
  UpdateBoardInput,
  CreateItemInput,
  UpdateItemInput,
  CreateColumnInput,
  UpdateColumnInput,
  CreateSwimlaneInput,
  UpdateSwimlaneInput,
} from '@awesome-markdown/contracts';
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
    const r = await this.req(
      endpoints.boards(this.base),
      { method: 'GET', signal },
      (d) => BoardsListResponseSchema.parse(d),
    );
    return r.boards;
  }

  async getBoard(boardId: string, signal?: AbortSignal): Promise<Board | null> {
    try {
      return await this.req(
        endpoints.board(this.base, boardId),
        { method: 'GET', signal },
        (d) => BoardResponseSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async createBoard(data: CreateBoardInput, signal?: AbortSignal): Promise<Board> {
    return this.req(
      endpoints.boards(this.base),
      { method: 'POST', body: JSON.stringify(data), signal },
      (d) => BoardResponseSchema.parse(d),
    );
  }

  async updateBoard(id: string, data: UpdateBoardInput, signal?: AbortSignal): Promise<Board> {
    return this.req(
      endpoints.board(this.base, id),
      { method: 'PUT', body: JSON.stringify(data), signal },
      (d) => BoardResponseSchema.parse(d),
    );
  }

  async deleteBoard(id: string, signal?: AbortSignal): Promise<void> {
    await this.req(
      endpoints.board(this.base, id),
      { method: 'DELETE', signal },
      (d) => DeleteResponseSchema.parse(d),
    );
  }

  // -- Items -----------------------------------------------------------------

  async listItems(boardId: string, signal?: AbortSignal): Promise<Item[]> {
    const r = await this.req(
      endpoints.items(this.base, boardId),
      { method: 'GET', signal },
      (d) => ItemsListResponseSchema.parse(d),
    );
    return r.items;
  }

  async getItem(boardId: string, itemId: string, signal?: AbortSignal): Promise<Item | null> {
    try {
      return await this.req(
        endpoints.item(this.base, boardId, itemId),
        { method: 'GET', signal },
        (d) => ItemResponseSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async createItem(data: CreateItemInput, signal?: AbortSignal): Promise<Item> {
    return this.req(
      endpoints.items(this.base, data.boardId),
      { method: 'POST', body: JSON.stringify(data), signal },
      (d) => ItemResponseSchema.parse(d),
    );
  }

  async updateItem(
    boardId: string,
    itemId: string,
    data: UpdateItemInput,
    signal?: AbortSignal,
  ): Promise<Item> {
    return this.req(
      endpoints.item(this.base, boardId, itemId),
      { method: 'PUT', body: JSON.stringify(data), signal },
      (d) => ItemResponseSchema.parse(d),
    );
  }

  async deleteItem(boardId: string, itemId: string, signal?: AbortSignal): Promise<void> {
    await this.req(
      endpoints.item(this.base, boardId, itemId),
      { method: 'DELETE', signal },
      (d) => DeleteResponseSchema.parse(d),
    );
  }

  // -- Columns ---------------------------------------------------------------

  async listColumns(boardId: string, signal?: AbortSignal): Promise<Column[]> {
    const r = await this.req(
      endpoints.columns(this.base, boardId),
      { method: 'GET', signal },
      (d) => ColumnsListResponseSchema.parse(d),
    );
    return r.columns;
  }

  async getColumn(boardId: string, colId: string, signal?: AbortSignal): Promise<Column | null> {
    try {
      return await this.req(
        endpoints.column(this.base, boardId, colId),
        { method: 'GET', signal },
        (d) => ColumnResponseSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async createColumn(data: CreateColumnInput, signal?: AbortSignal): Promise<Column> {
    return this.req(
      endpoints.columns(this.base, data.boardId),
      { method: 'POST', body: JSON.stringify(data), signal },
      (d) => ColumnResponseSchema.parse(d),
    );
  }

  async updateColumn(
    boardId: string,
    colId: string,
    data: UpdateColumnInput,
    signal?: AbortSignal,
  ): Promise<Column> {
    return this.req(
      endpoints.column(this.base, boardId, colId),
      { method: 'PUT', body: JSON.stringify(data), signal },
      (d) => ColumnResponseSchema.parse(d),
    );
  }

  async deleteColumn(boardId: string, colId: string, signal?: AbortSignal): Promise<void> {
    await this.req(
      endpoints.column(this.base, boardId, colId),
      { method: 'DELETE', signal },
      (d) => DeleteResponseSchema.parse(d),
    );
  }

  // -- Swimlanes -------------------------------------------------------------

  async listSwimlanes(boardId: string, signal?: AbortSignal): Promise<Swimlane[]> {
    const r = await this.req(
      endpoints.swimlanes(this.base, boardId),
      { method: 'GET', signal },
      (d) => SwimlanesListResponseSchema.parse(d),
    );
    return r.swimlanes;
  }

  async getSwimlane(boardId: string, slId: string, signal?: AbortSignal): Promise<Swimlane | null> {
    try {
      return await this.req(
        endpoints.swimlane(this.base, boardId, slId),
        { method: 'GET', signal },
        (d) => SwimlaneResponseSchema.parse(d),
      );
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async createSwimlane(data: CreateSwimlaneInput, signal?: AbortSignal): Promise<Swimlane> {
    return this.req(
      endpoints.swimlanes(this.base, data.boardId),
      { method: 'POST', body: JSON.stringify(data), signal },
      (d) => SwimlaneResponseSchema.parse(d),
    );
  }

  async updateSwimlane(
    boardId: string,
    slId: string,
    data: UpdateSwimlaneInput,
    signal?: AbortSignal,
  ): Promise<Swimlane> {
    return this.req(
      endpoints.swimlane(this.base, boardId, slId),
      { method: 'PUT', body: JSON.stringify(data), signal },
      (d) => SwimlaneResponseSchema.parse(d),
    );
  }

  async deleteSwimlane(boardId: string, slId: string, signal?: AbortSignal): Promise<void> {
    await this.req(
      endpoints.swimlane(this.base, boardId, slId),
      { method: 'DELETE', signal },
      (d) => DeleteResponseSchema.parse(d),
    );
  }
}
