-- BilisOps Chat — Supabase (Postgres) schema
-- Run this once in your Supabase project:  SQL Editor → paste → Run.
-- The API (Cloudflare Pages Function) talks to these tables with the
-- service-role key, which BYPASSES row-level security. RLS is still enabled
-- so the public/anon key can never read tenant data if it leaks.

-- Each entity keeps its full record in a `data` jsonb column so the JSON shape
-- matches the app exactly; indexed columns (id, seller_id) drive the queries.

create table if not exists sellers (
  id          text primary key,
  email_lower text unique not null,
  data        jsonb not null,           -- {id, email, name, salt, passHash, createdAt}
  created_at  timestamptz default now()
);

create table if not exists sessions (
  token      text primary key,
  seller_id  text not null references sellers(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists stores (
  id         text primary key,
  seller_id  text not null references sellers(id) on delete cascade,
  data       jsonb not null,            -- full store record (incl. storeToken)
  created_at timestamptz default now()
);

create table if not exists conversations (
  id         text primary key,
  seller_id  text not null references sellers(id) on delete cascade,
  updated_at timestamptz default now(),
  data       jsonb not null             -- {..., messages: [{direction,text,at}]}
);

create table if not exists orders (
  id         text primary key,
  seller_id  text not null references sellers(id) on delete cascade,
  data       jsonb not null,            -- {orderRef, status, amount, at, ...}
  created_at timestamptz default now()
);

create table if not exists knowledge (
  seller_id text primary key references sellers(id) on delete cascade,
  text      text not null default ''
);

create index if not exists stores_seller_idx        on stores(seller_id);
create index if not exists conversations_seller_idx on conversations(seller_id);
create index if not exists conversations_updated_idx on conversations(seller_id, updated_at desc);
create index if not exists orders_seller_idx        on orders(seller_id);

-- Deny-by-default for the anon/public key. Service role (used by the API) bypasses RLS.
alter table sellers       enable row level security;
alter table sessions      enable row level security;
alter table stores        enable row level security;
alter table conversations enable row level security;
alter table orders        enable row level security;
alter table knowledge     enable row level security;
