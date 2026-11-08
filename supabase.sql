-- Auditor web: monitorización de visitantes reales (RUM). Ejecutar en el editor SQL de Supabase.

create table if not exists public.rum_events (
  id bigint generated always as identity primary key,
  t timestamptz not null default now(),
  host text not null check (char_length(host) between 1 and 253),
  path text not null check (char_length(path) <= 300),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  net text check (net is null or char_length(net) <= 10),
  name text not null check (name in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0)
);

create index if not exists rum_events_host_t_idx on public.rum_events (host, t desc);

-- Seguridad cerrada por defecto: RLS activado y SIN políticas. Ni anon ni authenticated pueden leer
-- ni escribir; solo el servidor de la app con la clave service_role (que se salta RLS).
alter table public.rum_events enable row level security;
revoke all on public.rum_events from anon, authenticated;

-- Resumen por dispositivo y métrica calculado en la base de datos (percentil 75, como Google).
-- Evita traer miles de filas a la app (PostgREST limita a 1000 por defecto).
create or replace function public.rum_summary(p_host text, p_since timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with base as (
    select device, name, value,
      case name when 'LCP' then 2500 when 'INP' then 200 when 'CLS' then 0.1 when 'FCP' then 1800 else 800 end as good_t,
      case name when 'LCP' then 4000 when 'INP' then 500 when 'CLS' then 0.25 when 'FCP' then 3000 else 1800 end as poor_t
    from public.rum_events
    where host = p_host and t >= p_since
  ),
  agg as (
    select device, name,
      count(*) as n,
      percentile_disc(0.75) within group (order by value) as p75,
      avg((value <= good_t)::int) as good,
      avg((value > good_t and value <= poor_t)::int) as ni,
      avg((value > poor_t)::int) as poor
    from base
    group by device, name
  ),
  pages as (
    select path, count(*) as n, percentile_disc(0.75) within group (order by value) as lcp_p75
    from public.rum_events
    where host = p_host and t >= p_since and name = 'LCP'
    group by path
    order by n desc
    limit 20
  )
  select jsonb_build_object(
    'totalEvents', (select count(*) from public.rum_events where host = p_host and t >= p_since),
    'rows', coalesce((select jsonb_agg(to_jsonb(agg)) from agg), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n, 'lcpP75', lcp_p75)) from pages), '[]'::jsonb)
  );
$$;

revoke all on function public.rum_summary(text, timestamptz) from public, anon, authenticated;
grant execute on function public.rum_summary(text, timestamptz) to service_role;

-- Retención: se borran las mediciones de más de 90 días (cada día a las 03:17 UTC). Requiere pg_cron.
select cron.unschedule(jobid) from cron.job where jobname = 'rum-retencion';
select cron.schedule('rum-retencion', '17 3 * * *', $job$delete from public.rum_events where t < now() - interval '90 days'$job$);
