# 0008 — Microphone data sourcing

**Status:** Proposed. To be decided by the Phase 2 research spike, before any ingestion code is written.

## Context

The global `MicrophoneModel` catalogue is the backbone of recommendations. Data quality and legality both matter.

## Constraints already agreed

1. Prefer existing **public datasets or APIs with a clear licence**.
2. Otherwise prefer **manufacturer spec-sheet PDFs** (official, factual, stable) over scraping marketing pages. Consider asking manufacturers for data or permission.
3. Any automated collection must respect `robots.txt` and site terms, rate limit, send an identifying user agent, and cache.
4. The UK/EU **sui generis database right** applies on top of copyright: extracting a substantial part of a manufacturer's database is riskier than recording individual factual specs. **Legally unclear cases go to the product owner; the developer does not decide them.**
5. **No rehosting** of manufacturer images, graphs or PDFs. Store factual values, render our own charts and link to the official spec sheet.
6. Store digitised frequency/polar points when available; otherwise render idealised patterns, labelled as idealised.
7. Every value carries provenance (source URL, document title, retrieved date, licence notes, confidence). An admin review queue gates publication.
8. Ingestion runs as scripts/jobs, never on user requests. Start with about 75 common studio mics (list to be approved).

## Spike output (to fill in during Phase 2)

- Candidate sources evaluated, with licence and coverage notes
- Recommended approach and any items flagged for legal review
- Proposed starter mic list
