# 0008 — Microphone data sourcing

**Status:** Accepted (2026-10-08). The spike is complete and the product owner has decided L1–L6; L7 is deferred. See "Product-owner decisions" below.

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

## Spike findings

### 1. Is there a public, licensed dataset or API?

**No single source has both breadth and the specs we need** (sensitivity, self-noise, max SPL, impedance, powering, pads). The open sources that exist are useful for identity data and for measured curves on a handful of models.

| Source                                                                                                                                                                   | Licence                                                  | Coverage                                                                                                                                                                                                              | Verdict                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Wikidata](https://www.wikidata.org/)                                                                                                                                    | CC0                                                      | About 65 mic models are typed as microphones with a manufacturer (SM57, SM58, U 87, U 47, C414, TLM 103, KM 184, Coles 4038, M 160…). They are identity records with almost no spec values (SPARQL check, 2026-10-08) | **Use** for identity and cross-reference IDs only                                                                                                                                        |
| [DirPat, IEM Graz](https://phaidra.kug.ac.at/o:68229)                                                                                                                    | Public Domain Mark 1.0                                   | Measured AES69/SOFA impulse responses: AKG C414 (omni, cardioid, supercardioid, figure-8), AKG C480, Oktava MK 4012, Soundfield ST450                                                                                 | **Use**: measured FR and polar data for the C414                                                                                                                                         |
| [Surrey multi-angle mic IR dataset](https://zenodo.org/records/4633508) (Franco, Băcilă, Brookes, De Sena, [JAES 70(10), 2022](https://doi.org/10.17743/jaes.2022.0027)) | CC BY 4.0                                                | 25 mics (condenser, dynamic, ribbon; 7 multi-pattern), 0–355° in 5° steps, at 0.5, 1.25 and 5 m, 48 kHz. Includes the RØDE K2. I could not retrieve the full model table during the spike                             | **Use**. In 2b, take the model list from the open-access paper and prioritise overlaps with the starter list                                                                             |
| [SOYUZ Microphones open data](https://github.com/Soyuzmicrophones/soyuz-microphones-open-data)                                                                           | CC BY 4.0; trademarks not licensed                       | The Soyuz range, with frequency-response CSVs (some digitised from charts) and metadata                                                                                                                               | **Use**: a clean first-party source to prove the pipeline                                                                                                                                |
| [micirp (Xaudia, via audeering)](https://audeering.github.io/datasets/datasets/micirp.html)                                                                              | CC BY-SA 4.0                                             | 66 mostly vintage mics, measured in a foam booth, not free field                                                                                                                                                      | **Reject**: share-alike would bind our derived data, and booth measurements aren't comparable                                                                                            |
| [Micpedia](https://micpedia.com) (Odratek BV, NL; formerly Microphone Data; about 4,500 mics)                                                                            | No public licence. Returns HTTP 403 to automated fetches | The broadest aggregate available                                                                                                                                                                                      | **Do not use.** A third-party compilation of many makers' data is the clearest case for an EU database right (investment in obtaining and verifying). A licence enquiry is optional (L7) |
| Retailers, Sound On Sound, recordinghacks                                                                                                                                | All rights reserved                                      | Wide                                                                                                                                                                                                                  | **Do not use**, for the same database-right reason                                                                                                                                       |
| [Open Icecat](https://icecat.co.uk/menu/channelpartners)                                                                                                                 | Icecat Open Content Licence; API access permitted        | E-commerce fields, weak studio-mic coverage, full specs gated behind Full Icecat                                                                                                                                      | **Defer**: poor fit                                                                                                                                                                      |
| Manufacturer APIs                                                                                                                                                        | —                                                        | None found                                                                                                                                                                                                            | —                                                                                                                                                                                        |

### 2. Spec-sheet PDFs vs scraping

What the major makers' sites say (checked 2026-10-08):

| Maker      | `robots.txt`                                                          | Site terms (relevant clause)                                                                                                                                                                                                                                           | Governing law |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Neumann    | `Disallow: /downloadcenter/`, which is where the spec-sheet PDFs live | Texts and graphics are copyright; they "may not be used for business purposes, nor copied for forwarding" ([terms](https://www.neumann.com/en-li/download-terms-of-use))                                                                                               | Germany       |
| Sennheiser | Blocks `/episerver/`, `/utils/` and search                            | Content "may not be used without the explicit permission of Sennheiser, in particular, not copied or modified for commercial purposes". **Express text-and-data-mining reservation under UrhG §44b(3)** ([terms](https://www.sennheiser.com/en-dk/legal/terms-of-use)) | Germany       |
| Shure      | Allows everything except two login pages                              | No copying or distribution without consent; you "may download information and print out hard copies for your personal use" ([terms](https://www.shure.com/en-GB/legal/terms-and-conditions-of-website-use))                                                            | Illinois      |
| RØDE       | Blocks `/api/` and search                                             | Use "solely for your lawful, non-commercial, personal purposes" (2.1); "must not use any part of the Content for commercial purposes without obtaining a licence" (5.6) ([terms](https://rode.com/en-au/about/terms-of-use))                                           | Australia     |
| Royer      | `Crawl-delay: 30`                                                     | Not reviewed                                                                                                                                                                                                                                                           | US            |

Apart from Sennheiser's TDM reservation, none of the terms bans automated access by name. All of them restrict copying and commercial use of "Content", meaning the copyright material: text, images, graphics and documents. None mentions bare facts.

**Legal frame (UK/EU), in plain terms.** This is a developer's reading, not legal advice.

- **Copyright** doesn't protect bare facts such as "self-noise 12 dB-A". It does protect a spec sheet's text, layout and photos, and arguably its graphs.
- **Database right** ([CRDR 1997](https://www.legislation.gov.uk/uksi/1997/3032/part/III/made) Part III; Directive 96/9/EC Art 7) protects substantial investment in _obtaining, verifying or presenting_ data, not in _creating_ it ([BHB v William Hill, C-203/02](https://www.5rb.com/case/british-horse-racing-board-v-william-hill-organization-ltd)). A maker measuring its own mics is arguably creating data. Extraction infringes only where it puts at risk the maker's ability to recoup that investment ([CV-Online Latvia v Melons, C-762/19](https://www.ippt.eu/sites/ippt/files/2021/IPPT20210603_CJEU_CV-Online_Latvia_v_Melons.pdf)). Repeated, systematic extraction of insubstantial parts can still add up to infringement (reg 16(2) / Art 7(5)). Copying a third-party aggregator is the high-risk case; recording individual makers' own specs is the low-risk case.
- **After Brexit**, new UK database right (for databases made from 1 January 2021) only goes to UK makers, and EU database right only to EEA makers. Databases that existed before 2021 keep both ([gov.uk guidance](https://www.gov.uk/guidance/sui-generis-database-rights)). EU makers (Neumann, Sennheiser, AKG, Schoeps, DPA, Austrian Audio, Lewitt) and Odratek have EU rights wherever Kigumi serves EU users. We plan as if both regimes apply.
- **There is no commercial text-and-data-mining exception in the UK.** s29A CDPA covers non-commercial research only. The government's [March 2026 copyright and AI report](https://www.gov.uk/government/publications/report-and-impact-assessment-on-copyright-and-artificial-intelligence/copyright-and-artificial-intelligence-impact-assessment) dropped the proposed opt-out exception without naming a replacement. The EU DSM Art 4 exception honours opt-outs, and Sennheiser has made one expressly.
- **Contract:** under [Ryanair v PR Aviation (C-30/14)](https://curia.europa.eu/juris/liste.jsf?num=C-30/14), site terms can restrict use even of data that has no copyright or database-right protection. Whether browsewrap terms bind a visitor is uncertain, and they are governed by German, US and Australian law.
- **Trade marks:** using make and model names to identify products is referential use. We never use logos.

**Scraping is rejected.** The reasons: the terms above, Neumann's robots rule, Sennheiser's TDM reservation, the cumulative-extraction risk, brittle HTML, and marketing pages being less reliable than spec sheets. And 75 mics doesn't need automation.

## Decision

1. **Primary source: manual, human-in-the-loop transcription** of individual factual values from each maker's **official spec sheet** (the PDF, or the product page's spec table where no PDF exists). A person does one model at a time, writing into versioned seed files (format chosen in 2b). Every field carries provenance: source URL, document title, page, retrieved date, licence notes and confidence. Values keep their stated conditions instead of being normalised away: max SPL @ x% THD, sensitivity in mV/Pa or dBV/Pa, self-noise weighting.
2. **Open datasets** (Wikidata, DirPat, Surrey, SOYUZ) are imported by offline scripts. Attribution is stored in provenance and shown on the mic page, as CC BY requires.
3. **No crawler.** The only automated fetch is a link checker for spec-sheet URLs. It respects `robots.txt` and `Crawl-delay`, sends an identifying user agent, rate-limits, and uses HEAD requests only. It skips paths that robots.txt blocks, such as Neumann's `/downloadcenter/`.
4. **We keep no copies of manufacturer PDFs or graph images (L5)**: not in the repo, not in Blob storage, not in a private cache. When transcribing, the person records the source URL and a SHA-256 of the document, so changes can be detected, then deletes the download. Reviewers reopen the source URL.
5. **No aggregators** (Micpedia, retailers, magazines) as sources, not even for cross-checking.
6. Everything enters as `draft`, passes the admin review queue, then becomes `published`.
7. **Per-maker cap (L2):** until a maker grants permission, we transcribe no more than roughly a third of that maker's current microphone range, counted from their product listing at transcription time. Openly licensed sources (such as SOYUZ's data) don't count towards the cap.
8. **LLM-assisted drafting is allowed (L6)** as an offline admin script, never on user requests. A spec PDF may be sent to the Anthropic API to draft values. Drafts are always checked field by field against the source by a person before review, provenance records that the values were LLM-drafted, and the PDF isn't kept afterwards (L5).
9. **Manufacturer outreach runs in parallel and doesn't block anything:** a short permission and data request to the top ~10 makers. Start with Neumann, Sennheiser, Shure and RØDE, whose terms are strictest or whose models we take most. Permission lifts that maker's cap.

## Frequency response and polar capture

Each curve records a **`method`**: `dataset_measured` | `manufacturer_numeric` | `digitised_from_graph` | `idealised`. This refines the `measured` boolean in `docs/PLAN.md` §3. The UI labels each curve by method: "Measured (dataset)", "Manufacturer data (digitised)" or "Idealised — not measured".

- **Open datasets (impulse responses):**
  - **Frequency response:** an offline script takes the FFT of the far-field IR (Surrey at 1.25 m, to limit proximity effect), applies 1/3-octave smoothing and normalises to 0 dB at 1 kHz.
  - **Polar:** band energy at each angle, relative to 0°, at the octave centres from 125 Hz to 16 kHz.
  - We store only the derived points, never the audio.
- **Manufacturer graphs** are digitised by hand in **WebPlotDigitizer 4.x** (AGPL v3, run locally) or **Engauge Digitizer** (GPL). The tools' licences don't attach to their output. We use 4.x, not the closed-source v5 or its cloud "AI assist", so source documents aren't uploaded anywhere.
  - **Frequency response:** calibrate both axes (log Hz), then capture the 31 ISO 1/3-octave points from 20 Hz to 20 kHz plus any peaks and dips. Normalise to 0 dB at 1 kHz, and record the graph's dB-per-division and the PDF page. Confidence is medium (±1 dB) for a clear graph and low for a small or blurry one. Capture one curve per pattern and per filter setting shown.
  - **Polar:** for each frequency printed (typically 125 Hz–16 kHz), capture every 15° (24 points) in dB relative to 0°, with a −30 dB floor to match [ADR 0006](0006-chart-library.md). Half-plots are mirrored and recorded with `mirrored: true`.
- **Idealised fallback:** `r(θ) = A + (1 − A)·cos θ` from `docs/PLAN.md` §4.3, always labelled "Idealised — not measured".
- **QA:** a second person checks a 10% sample of digitised curves against the source. A curve is re-checked whenever its spec-sheet hash changes.

## Starter list (78 mics, approved 2026-10-08)

★ marks the first seed batch (25). Exact current model names and variants are confirmed during transcription.

- **Dynamic (17):** Shure SM57★, SM58★, SM7B★, SM7dB, Beta 52A★, Beta 57A, Beta 91A (boundary); Sennheiser MD 421-II★, MD 441-U, e 604, e 906★; Electro-Voice RE20★; Audix D6, i5; Beyerdynamic M 88 TG, M 201 TG; AKG D112 MkII★
- **Large-diaphragm condenser (29):** Neumann U 87 Ai★, U 47 fet, TLM 103★, TLM 102, U 67, TLM 49; AKG C414 XLS★, C414 XLII★, C414 B-ULS (discontinued), C214; Audio-Technica AT2020★, AT4040, AT4050★; RØDE NT1 (5th gen)★, NT1-A, NT2-A, K2; Shure KSM32, KSM44A; Sony C-800G; Warm Audio WA-87 R2, WA-47; Lewitt LCT 440 PURE; Austrian Audio OC818; Aston Origin; Mojave MA-200; Telefunken ELA M 251E; SOYUZ 017 FET; sE Electronics sE2200
- **Small-diaphragm condenser and shotgun (14):** Neumann KM 184★; Schoeps CMC 6 + MK 4★, CMC 6 + MK 2; DPA 4011A, 4006A; RØDE NT5★; AKG C451 B; Shure SM81★; Audio-Technica AT4053b; Sennheiser MKH 40, MKH 416; Earthworks QTC40; Line Audio CM4; Oktava MK-012
- **Ribbon (9):** Royer R-121★, R-10, R-122 MKII (active, phantom-safe); Coles 4038★; AEA R84, R44; Beyerdynamic M 160★, M 130; RØDE NTR
- **Boundary, specialty and stereo (7):** Sennheiser e 901; Yamaha SKRM-100 Subkick (discontinued); Neumann KMS 105; Shure Beta 87A; RØDE NT4 (XY); Neumann USM 69 i; Sennheiser MKH 30 (figure-8, for M/S)
- **Measurement (2):** Earthworks M23R, Behringer ECM8000

The batch covers every transducer type, pattern and powering case the Phase 4 rules need: passive ribbons that phantom can damage and phantom-safe active ribbons, multi-pattern mics, pads and filters, boundary, stereo and discontinued models. It also includes the models that have open measured data (C414, K2, SOYUZ).

## Product-owner decisions (2026-10-08)

The developer escalated these as legally unclear; the product owner decided them.

| #   | Question                                                                                                                                                                                                                   | Decision                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| L1  | Transcribe individual factual specs for a commercial product without the maker's permission?                                                                                                                               | **Yes.**                                                                                                           |
| L2  | Cap how much of one maker's range we take until they give permission? (The starter list has 9 Neumann and 11 Shure models.) Repeated systematic extraction could be argued to be a substantial part of a maker's database. | **Yes**: about a third of the maker's current range (Decision 7).                                                  |
| L3  | Digitise manufacturer FR and polar graphs and redraw them as our own charts? The points are measurement facts; whether a faithful re-plot reproduces a protected graph is uncertain.                                       | **Yes.**                                                                                                           |
| L4  | Do site terms restricting commercial use (RØDE 2.1 and 5.6, Neumann "business purposes", Sennheiser "explicit permission", Shure "personal use") stop us recording facts?                                                  | **No: recording facts is permitted.** No maker is skipped because of its terms. We still never copy their Content. |
| L5  | Keep private working copies of spec PDFs for review and re-digitising?                                                                                                                                                     | **No** (Decision 4).                                                                                               |
| L6  | Use an LLM to draft values from spec PDFs for human review? This is a further use of the document and sits close to Sennheiser's TDM reservation.                                                                          | **Yes**, internal drafting with human verification (Decision 8).                                                   |
| L7  | Ask Odratek (Micpedia) or Icecat about a commercial licence for breadth beyond the starter list?                                                                                                                           | **Not yet.** Revisit when breadth matters; tracked in `future-considerations.md`.                                  |

Still to consider: a short paid IP opinion before public launch.

## Consequences

- Breadth grows slowly, roughly 15–40 minutes per mic with curves, but every value is traceable and defensible. This protects the "real spec data" differentiator.
- The Phase 2b schema needs: `method` per curve, `mirrored`, PDF page and document hash in `Provenance`, a stated-conditions field next to scalar specs, and attribution text for CC BY sources. Provenance also records how values were extracted (by hand, or LLM-drafted then verified) and who verified them.
- Seed validation should count transcribed models per maker so the L2 cap is checked, not remembered.
- Scraping stays ruled out unless a maker grants permission or we buy a licensed feed (L7).
