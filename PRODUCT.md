# PRODUCT.md — Renew Subastas (CARBID)

register: brand

## Product Purpose

Renew Subastas is the online vehicle-auction platform of **Santa Rosa Automotores** (Paraguay). Operators load vehicles, schedule timed auctions, and registered buyers bid. Winners pay a deposit (seña) to secure the vehicle; a finance role confirms payment. The platform runs on the web today and shares its core logic with a future native app, so all business rules live server-side (Firebase Functions) and the UI stays presentational.

## Users

- **Admin** — full control: users, roles, company configuration, every auction and vehicle, payment confirmation, audit log. Few people, high trust. Email on the company domain.
- **Staff** — operations: load vehicles (photos, specs), create and run auctions. Cannot create admins or confirm payments. Company-domain email.
- **Finanzas** — payments only: sees the sales ledger in real time, confirms or forfeits deposits, reads the winner's contact data and uploaded proof. Read-only everywhere else.
- **Comprador (buyer)** — the public bidder. Two audiences kept strictly apart: **retail** (general public) and **wholesale** (mayorista). A buyer only ever sees their own segment's catalogue and auctions.

These are not technical users. Onboarding material must explain the platform in plain Spanish, step by step, for people who have never used an auction tool.

## Brand & Tone

Monochrome, confident, restrained. Black ink on warm-neutral paper, the white/black "renew" wordmark, generous space. The feeling is a serious dealership, not a flashy crypto app: trustworthy, legible, quietly premium. Spanish (es-PY): currency and dates in local format, plain direct wording, no jargon, no hype. Color appears only to mark status (won, outbid, pending, forfeited), never as decoration.

## Strategic Principles

- Trust over excitement. Money and vehicles are at stake; clarity beats cleverness.
- One idea per screen. Non-technical readers should never feel lost.
- Status is always visible and unambiguous (where am I, what happens next).
- Consistency with the product's real identity: the transactional emails are the canonical brand reference; everything else matches them.

## Anti-references

- Generic SaaS dashboards with gradient hero metrics and identical card grids.
- Neon-on-black "marketplace" or crypto aesthetics.
- Stock-photo corporate decks with clip-art icons and bullet soup.
- Anything that reads as machine-generated filler.
