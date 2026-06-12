-- =============================================================
-- EVENT CONTROLS MIGRATION — pickup tracking + duplicate logging
-- =============================================================
-- Safe to run multiple times. Run in the Supabase SQL editor.
-- Does not touch or rewrite any existing data.
-- =============================================================

-- ----- WINNERS: pickup tracking ----------------------------------
alter table winners add column if not exists picked_up    boolean not null default false;
alter table winners add column if not exists picked_up_at timestamptz;
alter table winners add column if not exists picked_up_by text;

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
