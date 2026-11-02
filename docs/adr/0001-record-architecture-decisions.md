# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-02

## Context

This project is built mostly autonomously, by humans and AI agents working across many sessions.
Decisions made in one session need to survive into the next one without being re-argued.

## Decision

We keep lightweight ADRs in `docs/adr/`, numbered sequentially, using `0000-template.md`.
Each ADR covers one decision. Accepted ADRs are immutable: to change a decision, write a new ADR
and mark the old one `Superseded by NNNN`. Defaults we pick without asking the owner are also
recorded here, so the owner can review and overturn them.

## Consequences

- Anyone can see why the system looks the way it does.
- Writing an ADR is part of the change that makes the decision (see `AGENTS.md`).
