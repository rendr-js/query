import { component, element, text, useState } from '@rendrjs/core';
import { mount, screen, userEvent } from '@rendrjs/testing-library';
import { Mock, expect, test, vi } from 'vitest';
import { FetchInit, QueryResponse, api } from '.';

const makeGetHook = <Input, Resp>(resp: (input: Input) => Resp, request: (input: Input) => string | FetchInit): [(input: Input) => QueryResponse<Resp>, Mock<[input: RequestInfo | URL, init?: RequestInit | undefined], Promise<Response>>] => {
  let res: Resp;
  const fetch = (input: RequestInfo | URL, init?: RequestInit | undefined): Promise<Response> => {
    const resp = JSON.stringify(res);
    return new Promise(r => setTimeout(() => r(new Response(resp)), 100));
  };
  const fn = vi.fn(fetch);

  const fakeApi = api({
    baseUrl: 'https://fakeapi.com',
    fetch: fn,
  });

  return [fakeApi.get<Input, Resp>({
    request: input => {
      res = resp(input);
      return request(input);
    },
  }), fn];
}

test('uses cache', async () => {
  const user = userEvent.setup();
  const response = ['foo', 'bar', 'baz'];
  const [useGetItems, fetch] = makeGetHook<void, string[]>(() => response, () => '/');
  const render = vi.fn();

  const Items = () => {
    render();
    const items = useGetItems();

    if (items.loading) {
      return element('div', { slot: text('loading') });
    }

    return element('div', {
      slot: items.data.map(item => element('p', { slot: text(item) })),
    });
  };

  const App = () => {
    const [count, setCount] = useState(0);

    return element('div', {
      slot: [
        element('button', {
          slot: text('toggle'),
          onclick: () => setCount(c => c + 1),
        }),
        count % 2 === 0 ? text('foo') : component(Items),
      ],
    });
  };

  const container = mount(component(App));
  const toggler = screen.getByText(container, 'toggle');
  expect(container.textContent).include('foo');
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include('loading'));
  await screen.waitFor(() => expect(container.textContent).include(response.join('')));
  expect(fetch).toHaveBeenCalledOnce();
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include('foo'));
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include(response.join('')));
  expect(fetch).toHaveBeenCalledOnce();
  await screen.waitFor(() => expect(render).toHaveBeenCalledTimes(3));
});

test('uses cache for inputs', async () => {
  const user = userEvent.setup();
  const [useGetItems, fetch] = makeGetHook<number, string[]>((id: number) => id % 2 === 0 ? ['foo', 'bar'] : ['bar', 'baz'], (id: number) => `/${id}`);
  const render = vi.fn();

  const Items = (props: { id: number }) => {
    render();
    const items = useGetItems(props.id);

    if (items.loading) {
      return element('div', { slot: text('loading') });
    }

    return element('div', {
      slot: items.data.map(item => element('p', { slot: text(item) })),
    });
  };

  const App = () => {
    const [count, setCount] = useState(0);

    return element('div', {
      slot: [
        element('button', {
          slot: text('toggle'),
          onclick: () => setCount(c => c + 1),
        }),
        component(Items, { id: count % 2 }),
      ],
    });
  };

  const container = mount(component(App));
  const toggler = screen.getByText(container, 'toggle');
  expect(container.textContent).include('loading');
  await screen.waitFor(() => expect(container.textContent).include('foobar'));
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include('loading'));
  await screen.waitFor(() => expect(container.textContent).include('barbaz'));
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include('foobar'));
  user.click(toggler);
  await screen.waitFor(() => expect(container.textContent).include('barbaz'));
  await screen.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await screen.waitFor(() => expect(render).toHaveBeenCalledTimes(6));
});

test('no dupe requests for simultaneous mounts', async () => {
  const response = ['foo', 'bar', 'baz'];
  const [useGetItems, fetch] = makeGetHook<void, string[]>(() => response, () => '/');
  const render = vi.fn();

  const Items = () => {
    render()
    const items = useGetItems();

    if (items.loading) {
      return element('div', { slot: text('loading') });
    }

    return element('div', {
      slot: items.data.map(item => element('p', { slot: text(item) })),
    });
  };

  const App = () => {
    return element('div', {
      slot: [component(Items), component(Items)],
    });
  };

  const container = mount(component(App));
  expect(container.textContent).include('loadingloading');
  await screen.waitFor(() => expect(container.textContent).include(response.join('') + response.join('')));
  await screen.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await screen.waitFor(() => expect(render).toHaveBeenCalledTimes(4));
});

test('no extra rendrs', async () => {
  const response = ['foo', 'bar', 'baz'];
  const [useGetItems] = makeGetHook<void, string[]>(() => response, () => '/');
  const render = vi.fn();

  const App = () => {
    render();
    const items = useGetItems();
    if (items.loading) {
      return element('div', { slot: text('loading') });
    }
    return element('div', {
      slot: items.data.map(item => element('p', { slot: text(item) })),
    });
  };

  const container = mount(component(App));
  expect(container.textContent).include('loading');
  await screen.waitFor(() => expect(container.textContent).include(response.join('')));
  await screen.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
});
