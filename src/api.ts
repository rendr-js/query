import { Atom, createAtom } from '@rendrjs/core';
import { QueryResponse } from './hooks';

export type FetchInit = Omit<RequestInit, 'body' | 'method'> & { url: string, body?: any };

export type RequestConfig<Input> = {
  query: (input: Input) => string | FetchInit;
  ttl?: number
  tags?: string[] // | (resp: Resp) => string[]
  invalidates?: string[] // | (resp: Resp) => string[]
};

export interface CachedResponse {
  resp: QueryResponse<any>
  exp?: number
  tags?: Set<string>
}

export type Request<Input, Resp> = {
  query: (input: Input) => Parameters<typeof fetch>
  fetch: typeof fetch
  ttl?: number
  tags: Set<string>
  invalidates: Set<string>
  atom: Atom<Record<string, CachedResponse | undefined>>
};

type EndpointMap<M> = Record<keyof M, Request<any, any>>;

type InferredRequest<M extends EndpointMap<M>, K extends keyof M> = M[K] extends Request<infer I, infer R> ? Request<I, R> : never;

export type Api<M extends EndpointMap<M>> = {
  [K in keyof M]: InferredRequest<M, K>
};

export interface Builder {
  get: <Input, Resp>(cfg: RequestConfig<Input>) => Request<Input, Resp>
  post: <Input, Resp>(cfg: RequestConfig<Input>) => Request<Input, Resp>
};

export interface ApiConfig<M extends EndpointMap<M>> {
  endpoints: (builder: Builder) => M
  baseUrl?: string
  init?: Omit<RequestInit, 'body' | 'method'>
  fetch?: typeof fetch
};

export let createApi = <M extends EndpointMap<M>>(apiConfig: ApiConfig<M>): Api<M> => {
  let baseUrl = apiConfig.baseUrl ?? '';
  let fetch = apiConfig.fetch ?? window.fetch.bind(window);
  let atom = createAtom<Record<string, CachedResponse | undefined>>({});

  let builder: Builder = {
    get: requestConfig => {
      return {
        ttl: requestConfig.ttl,
        tags: new Set(requestConfig.tags),
        invalidates: new Set(),
        atom,
        fetch,
        query: input => {
          let init: Omit<FetchInit, 'url'> = { ...apiConfig.init };
          let reqInfo = requestConfig.query(input);
          if (typeof reqInfo === 'string') {
            return [baseUrl + reqInfo, init];
          }
          let url = baseUrl + reqInfo.url;
          let key: keyof typeof reqInfo;
          for (key in reqInfo) {
            if (key === 'url') continue;
            init[key] = reqInfo[key];
          }
          return [url, init];
        },
      };
    },
    post: requestConfig => {
      return {
        invalidates: new Set(requestConfig.invalidates),
        tags: new Set(),
        atom,
        fetch,
        query: input => {
          let init: RequestInit = { ...apiConfig.init, method: 'post' };
          let reqInfo = requestConfig.query(input);
          if (typeof reqInfo === 'string') {
            return [baseUrl + reqInfo, init];
          }
          let url = baseUrl + reqInfo.url;
          let key: keyof typeof reqInfo;
          for (key in reqInfo) {
            if (key === 'url') continue;
            let val = reqInfo[key];
            if (key === 'body') {
              init[key] = JSON.stringify(val);
            } else if (val) {
              init[key] = val;
            }
          }
          return [url, init];
        },
      };
    },
  };

  return apiConfig.endpoints(builder) as unknown as Api<M>;
};
