-- =============================================================
-- THE BIG KETER EVENT - MONSEY | RAFFLE SCHEMA
-- =============================================================
-- Apply once in the Supabase SQL editor.
-- This schema is intentionally minimal: one event, one DB, done.
-- =============================================================

create extension if not exists "pgcrypto";

-- ----- ENTRIES ---------------------------------------------------
-- One row per person who fills out the public entry form.
-- phone_normalized has a UNIQUE constraint to block double entries.
create table if not exists entries (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  phone_display     text not null,        -- (718) 123-4567
  phone_normalized  text not null unique, -- 7181234567
  email             text not null,
  street_address    text not null,
  zip_code          text not null,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists entries_created_at_idx on entries (created_at desc);
create index if not exists entries_is_demo_idx    on entries (is_demo);


-- ----- RAFFLE ROUNDS --------------------------------------------
-- Each click of "Start New Raffle" creates one row here.
-- It also snapshots all eligible entries into raffle_round_entries.
create table if not exists raffle_rounds (
  id            uuid primary key default gen_random_uuid(),
  round_number  integer not null unique,
  started_at    timestamptz not null default now(),
  frozen_at     timestamptz not null default now(),
  ended_at      timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists raffle_rounds_created_at_idx on raffle_rounds (created_at desc);


-- ----- RAFFLE ROUND ENTRIES -------------------------------------
-- The frozen pool of contestants per round.
create table if not exists raffle_round_entries (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references raffle_rounds(id) on delete cascade,
  entry_id   uuid not null references entries(id)       on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, entry_id)
);

create index if not exists raffle_round_entries_round_idx on raffle_round_entries (round_id);


-- ----- WINNERS ---------------------------------------------------
-- One person cannot win two prizes in the same round (unique constraint).
create table if not exists winners (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references raffle_rounds(id) on delete cascade,
  entry_id     uuid not null references entries(id)       on delete cascade,
  prize        text not null,               -- '$100 Gift Card' | 'Any Book In Store'
  won_at       timestamptz not null default now(),
  picked_up    boolean not null default false,
  picked_up_at timestamptz,
  picked_up_by text,
  unique (round_id, entry_id)
);

create index if not exists winners_round_idx  on winners (round_id);
create index if not exists winners_won_at_idx on winners (won_at desc);


-- ----- DUPLICATE ATTEMPTS ----------------------------------------
-- One row per blocked duplicate-phone entry submission (for analytics).
create table if not exists duplicate_attempts (
  id               uuid primary key default gen_random_uuid(),
  phone_normalized text not null,
  phone_display    text,
  attempted_name   text,
  attempted_email  text,
  attempted_at     timestamptz not null default now()
);

create index if not exists duplicate_attempts_attempted_at_idx
  on duplicate_attempts (attempted_at desc);


-- =============================================================
-- No RLS configured.
-- All DB access goes through Next.js API routes using the
-- SUPABASE_SERVICE_ROLE_KEY. The anon key is not used client-side.
-- =============================================================
