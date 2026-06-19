-- =============================================================
-- MIGRATION: Terms & Conditions + marketing-email consent
-- =============================================================
-- Adds the consent columns captured by the public raffle entry form.
-- Safe to run more than once (uses IF NOT EXISTS).
-- Run once in the Supabase SQL editor, then deploy.
--
-- Until this is applied, the entries API silently falls back to
-- inserting without these columns so the entry flow never breaks
-- (see app/api/entries/route.ts). After it is applied, every new
-- entry records the consent fields.
-- =============================================================

alter table entries
  add column if not exists terms_accepted           boolean not null default false,
  add column if not exists terms_accepted_at         timestamptz,
  add column if not exists terms_version             text,
  add column if not exists marketing_email_consent   boolean not null default false,
  add column if not exists marketing_consent_source  text;
