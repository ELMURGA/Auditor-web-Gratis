create table if not exists rum_events (
  id bigint generated always as identity primary key,
  t timestamptz not null default now(),
  host text not null,
  path text not null,
  device text not null check (device in ('mobile','tablet','desktop')),
  net text,
  name text not null check (name in ('LCP','INP','CLS','FCP','TTFB')),
  value double precision not null
);
create index if not exists rum_events_host_t on rum_events (host, t desc);
alter table rum_events enable row level security; -- sin políticas: solo el service role (servidor) accede
