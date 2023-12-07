import { useAtom, useAtomSetter, useCallback, useEffect, useState } from '@rendrjs/core';
import { Request } from './api';

interface LoadingQueryResponse<Resp> {
  data: Resp | null;
  loading: true;
}

interface LoadedQueryResponse<Resp> {
  data: Resp;
  loading: false;
}

export type QueryResponse<Resp> = LoadingQueryResponse<Resp> | LoadedQueryResponse<Resp>;

type UseQuery = {
  <Resp>(endpoint: Request<void, Resp>): QueryResponse<Resp>
  <Input, Resp>(endpoint: Request<Input, Resp>, input: Input): QueryResponse<Resp>
};

export let useQuery: UseQuery = <Input, Resp>(request: Request<Input, Resp>, input?: Input): QueryResponse<Resp> => {
  let [state, setState] = useAtom(request.atom);
  let [info, init] = request.query(input as Input);
  let key = `${JSON.stringify(info)}:${JSON.stringify(init)}`;

  useEffect(() => {
    setState(s => {
      let resp = s[key];
      if (!resp || !resp.exp || (resp.exp && resp.exp < Date.now())) {
        request.fetch(info, init).then(r => r.json()).then(data => {
          setState(s => ({
            ...s,
            [key]: {
              resp: { loading: false, data },
              exp: request.ttl ? request.ttl * 1000 + Date.now() : undefined,
              tags: request.tags,
            },
          }));
        });
        return {
          ...s,
          [key]: {
            resp: { loading: true, data: null },
          },
        };
      }
      return s;
    });
  }, [request, key]);
  
  return state[key]?.resp ?? { loading: true, data: null };
};

export type Mutation<Input, Resp> = [(input: Input) => void, MutationResponse<Resp>];

export type MutationResponse<Resp> = {
  data: Resp | null
  loading: boolean
};

export let useMutation = <Input, Resp>(request: Request<Input, Resp>): Mutation<Input, Resp> => {
  let [state, setState] = useState<MutationResponse<Resp>>({ loading: false, data: null });
  let setQueryCache = useAtomSetter(request.atom);

  let mutate = useCallback((input: Input) => {
    setState(s => ({ ...s, loading: true }));
    let [info, init] = request.query(input as Input);
    request.fetch(info, init).then(r => r.json()).then(data => {
      setState({ loading: false, data });
      setQueryCache(cache => {
        if (!request.invalidates || request.invalidates.size === 0) {
          return cache;
        }
        let changed = false;
        for (let key in cache) {
          let val = cache[key]!;
          if (!val.tags) {
            continue;
          }
          for (let invalidation of request.invalidates) {
            if (val.tags.has(invalidation)) {
              delete cache[key];
              changed = true;
              break;
            }
          }
        }
        if (!changed) {
          return cache;
        }
        return { ...cache };
      });
    });
  }, [request]);

  return [mutate, state];
};
