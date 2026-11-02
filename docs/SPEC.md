# Product Specification

> Copied from the owner's planning note on 2026-11-02 so that everyone working on this repo has the requirements in-tree. The owner's note is the source of truth; when it changes, update this copy and log it in `PROGRESS.md`.

We're building a production-grade, website. This is a professional-grade website that needs to be stable, secure, performant, fully-tested and deployable.

## Goals

- This is a website for an independent, on-campus cleaning service for Gordon College students (not affiliated with or endorsed by Gordon College).
- Core Value Proposition: Offer great rates for cleaning rooms and bathrooms so students can easily pass dorm inspections and avoid costly Gordon College fines (referencing official fine info found on the Gordon College website).
- Booking & Payment: Students can sign up for cleaning slots directly through the website; all payments are collected in person via **cash or Venmo**.

## Dev Workflow

- Ask questions only when absolutely necessary - work autonomously.
- Do ask a series of initial questions to fill in gaps in this document's instructions and append to this document accordingly.
- IMPORTANT! DO NOT look outside of working directory or use other code on my computer as reference.
- Security, scalability, and reliability are of utmost importance.
- Do things properly, this is production-grade and not a hack project.
- Create `AGENTS.md` and relevant skills to support development and contain concrete development guidelines.
- Maintain a `PLAN.md` with roadmap and current status, a `PROGRESS.md` log, and a `docs/adr/` folder recording your decisions.
- Maintain a rule for when blocked to document the blocker, stub the dependency behind an interface, and move on rather than stalling.
- Commit and push to gitlab repo. Important: do a code review before committing.

## Tech Stack

- Needs to be deployable as a website on Cloudflare Pages.

## Website Overview

- **Home Page**
  - Clear, catchy statement introducing the independent cleaning service.
  - Highlighting the main draw: **Avoid costly Gordon College dorm and bathroom fines** with affordable professional cleaning.
  - Quick CTA to view rates, get a quote, or book a cleaning slot.
- **Services & Rates**
  - Room Cleaning Package (dusting, floors, trash, surface wiping).
  - Bathroom Cleaning Package (scrubbing showers, sinks, toilets, mirrors to meet strict inspection standards).
  - Clear pricing breakdown and checklist showing what inspectors look for based on Gordon College guidelines.
- **Get a Quote**
  - A custom request section where students can describe their space and **upload image(s)** of their room or bathroom to receive a tailored estimate for heavier messes or custom jobs.
- **Book a Time**
  - Interactive booking calendar / time slot selector.
  - Captures student contact info, dorm building, room number, and chosen cleaning window.
  - Clear notice explaining that **payment is due in person via Cash or Venmo** upon completion/arrival.
- **Work With Us (Join the Team)**
  - Application portal for students looking to **work as a cleaner**.
  - Highlights the compensation model: **75% commission split** per job for cleaners.
- **FAQ / Fine Guide**
  - Breakdown of common inspection pitfalls and Gordon College fine policies (with links/references to official guidelines).
  - Tips for keeping rooms clean between visits.
- **Contact Us**
  - Quick contact form or direct email/text info for general inquiries or rescheduling.

## Clarifications (answered 2026-11-02)

- **Brand name:** Scot-Free Cleaning. Do not use "Gordon" in the brand; every page carries a clear "not affiliated with or endorsed by Gordon College" disclaimer.
- **Launch pricing** (kept in a single config file so it is easy to change):
  - Room package: $30
  - Bathroom package: $40
  - Room + Bathroom bundle: $60
  - Cleaner payout at a 75% commission: $22.50 / $30 / $45.
- **Operations / admin:** All submissions (bookings, quote requests, job applications, contact messages) are stored in a database. A private admin dashboard, protected by Cloudflare Access, lets the owner view, confirm and cancel bookings, manage availability, and review quotes and applications. The owner also gets an email alert for each new submission.
- **Availability model:** A recurring weekly schedule of cleaning windows, each with a capacity (number of jobs at once). Admins can block dates or windows and add extra one-off slots, for example during inspection week. Slots close automatically when full.
- **Contact info / Venmo:** Use clearly marked placeholders for now (email, phone/text number, Venmo handle), kept in one config file. Replacing them is a launch blocker tracked in `PLAN.md`.
- **Domain / email:** No domain yet; launch on `*.pages.dev`. Email sending sits behind an interface: it logs in development and uses Resend once a domain is verified. Customers always get an on-screen confirmation.
- **Git hosting:** Commit locally, with a code review before each commit. The user will create an empty GitLab project and provide its URL; add the remote and push then.
- **Project location:** `~/Developer/scot-free-cleaning`.
- **Defaults chosen without asking** (recorded as ADRs in the repo): cancellation/reschedule with at least 24 hours' notice via the contact page; quote photos limited to 5 images, 10 MB each, stored privately and deleted after 90 days; Cloudflare Turnstile for bot protection on every form.
