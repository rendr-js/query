import {
  createAtom,
  useAtom,
  useAtomSetter,
  useEffect,
  useImmediateEffect,
  useState,
} from '@rendrjs/core';

export interface ApiConfig {
  baseUrl?: string
  fetch?: typeof fetch
  init?: Omit<RequestInit, 'method'>
}

interface LoadingQueryResponse<Resp> {
  data: Resp | null;
  loading: true;
}

interface LoadedQueryResponse<Resp> {
  data: Resp;
  loading: false;
}

export type QueryResponse<Resp> = LoadedQueryResponse<Resp> | LoadingQueryResponse<Resp>;

export type FetchInit = Omit<RequestInit, 'body' | 'method'> & { url: string, body?: any };

export interface RequestConfig<Input> {
  request: (input: Input) => string | FetchInit
  tags?: string[] // TODO: one or neither, not both
  invalidates?: string[]
}

export type RequestHookGenerator = <Input, Resp>(config: RequestConfig<Input>) => (input: Input) => QueryResponse<Resp>;

export interface Api {
  get: RequestHookGenerator
  post: RequestHookGenerator
  put: RequestHookGenerator
  delete: RequestHookGenerator
  patch: RequestHookGenerator
}

interface CachedResponse {
  resp: QueryResponse<any>
  tags: Set<string>
}

type CachedResponses = Record<string, CachedResponse | undefined>

export const api = (config: ApiConfig): Api => {
  const fetchFn = config.fetch ?? fetch;
  const baseUrl = config.baseUrl ?? '';
  const makeFetchArgs = (arg: string | FetchInit, method: string): Parameters<typeof fetch> => {
    if (typeof arg === 'string') {
      return [baseUrl + arg, { ...config.init, method }];
    }
    for (const key in arg) {
      if (key === 'body') {
        arg.body = JSON.stringify(arg.body);
      }
    }
    return [baseUrl + arg.url, { ...config.init, method, ...arg }];
  };

  const cacheAtom = createAtom<CachedResponses>({});

  const generate = (method: string): RequestHookGenerator => {
    return <Input, Resp>(cfg: RequestConfig<Input>) => {
      const invalidates = new Set(cfg.invalidates)
      return (input: Input): QueryResponse<Resp> => {
        const setCache = useAtomSetter(cacheAtom);
        const [response, setResponse] = useState<QueryResponse<Resp>>({ loading: true, data: null });
        useEffect(() => {
          fetchFn(...makeFetchArgs(cfg.request(input), method)).then(r => r.json()).then((data: Resp) => {
            setCache(cache => {
              for (const key in cache) {
                const tags = cache[key]!.tags;
                for (const tag of invalidates) {
                  if (tags.has(tag)) {
                    delete cache[key]
                    return { ...cache };
                  }
                }
              }
              return cache;
            });
            setResponse({ loading: false, data });
          })
        }, []);
        return response;
      };
    };
  };

  const get = <Input, Resp>(cfg: RequestConfig<Input>) => {
    const tags = new Set(cfg.tags)
    return (input: Input): QueryResponse<Resp> => {
      const key = JSON.stringify(input);
      const [cache, setCache] = useAtom(cacheAtom);
      useImmediateEffect(() => {
        if (!cache[key]) {
          cache[key] = { resp: { data: null, loading: true }, tags }
          fetchFn(...makeFetchArgs(cfg.request(input), 'GET')).then(r => r.json()).then((data: Resp) => {
            setCache(cache => ({
              ...cache,
              [key]: { resp: { data, loading: false }, tags },
            }));
          });
        }
      }, [key]);
      return cache[key]!.resp;
    };
  };

  return {
    get,
    post: generate('POST'),
    patch: generate('PATCH'),
    delete: generate('DELETE'),
    put: generate('PUT'),
  };
};
