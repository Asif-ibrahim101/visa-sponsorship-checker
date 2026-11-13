# Visa Sponsorship Checker

<img src="public/icons/icon-128.png" width="64" alt="">

Chrome extension that badges UK job listings with how likely they are to come with Skilled Worker visa sponsorship, using the Home Office sponsor register and the advert's own wording.

Works on LinkedIn and Indeed (search results and job pages), company career pages on Workday, Greenhouse, Lever and Ashby, Welcome to the Jungle job pages, and any site publishing schema.org JobPosting data. Everything runs locally; the only network request is the GOV.UK register download. [Privacy policy](https://asif-ibrahim101.github.io/visa-sponsorship-checker/privacy.html).

Not affiliated with the Home Office, UKVI or any job site. Badges are a guide, not legal advice.

## Run it

```sh
npm install
npm run build        # output in dist/
```

In Chrome: `chrome://extensions` → turn on Developer mode → Load unpacked → pick `dist/`.
The sponsor register (about 11 MB) downloads on install; badges appear once it has.

`npm run dev` rebuilds on save. `npm test` runs the unit tests. `npm run package` tests, builds and zips `dist/` into `release/` for the Chrome Web Store; the listing text is in `STORE.md` and the images in `assets/store/`. After every build, click the reload arrow on the extension in `chrome://extensions`.

The build (`scripts/build.mjs`) ships the content script as one plain file with no loader. An earlier build used the CRXJS plugin, whose loader imports the real script at runtime; on LinkedIn that import failed silently and no badges appeared.

## Layout

| Path | What it does |
| --- | --- |
| `src/engine/` | Pure rules: name normalising, register matching, salary, phrases, role flags, verdict |
| `src/register/` | Finds, parses and stores the GOV.UK register |
| `src/background/` | Service worker: weekly refresh, name lookups |
| `src/content/linkedinAdapter.ts` | LinkedIn's markup |
| `src/content/sites/` | Indeed, Greenhouse, and a JobPosting (JSON-LD) reader for everything else |
| `src/content/` | Badges, hover reason, right-click overrides, dimming |
| `src/popup/`, `src/options/` | Toolbar popup and settings page |

## Verdict rules

First match wins (`src/engine/verdict.ts`):

1. Advert explicitly rules out sponsorship → **No**
2. Posted by an agency → **Unknown employer** (Possible if the advert offers sponsorship)
3. Company not on the register → **Not licensed** (Possible if the advert offers sponsorship)
4. Licensed, salary wholly below the floor or role flagged → **Unlikely**
5. Licensed, advert offers sponsorship → **Sponsors**
6. Licensed, advert only has "must have the right to work" wording → **Unlikely**
7. Licensed, salary range straddles the floor → **Possible**
8. Licensed, advert silent → **Possible**

The advert is read only for jobs you open (LinkedIn loads the description on click); until then the card badge has a dashed edge. Reading uses the phrase lists in `src/engine/phrases.ts` plus a sentence-level check: a sentence that mentions sponsoring alongside visa wording counts as an offer, as a "No" when a negative word comes just before it, as a soft negative when it prefers candidates who don't need it, and as "unclear" (quoted in the hover) when it is a question.

**Agency posts** (status Unknown employer) are hidden by default; switch "Hide agency posts" off in the popup or settings to see them.

**Entry level** gets a purple pill next to the status (`src/engine/experience.ts`). A title with Graduate, Junior, New Grad, Entry level, Early Careers, Trainee or "Engineer I" qualifies; so does an opened advert saying "recent graduates", "no prior experience required" or asking for at most 1 year. A Senior/Lead/Staff/Principal or level II+ title, an internship or apprenticeship, or an advert asking for 2+ years rules it out.

Differences from the PRD: right-to-work wording is Unlikely rather than No, agencies get their own status, and a range counts as below the floor only when its top end is.

## Company matching

In order (`src/engine/matcher.ts`):

1. **Alias:** a hand-checked list of brands whose register name is unrelated, e.g. Deutsche Bank → DB Group Services (UK) Ltd (`ALIAS_LIST` in `src/engine/normalise.ts`). Add to it when you find a miss.
2. **Exact:** same name apart from legal forms (Ltd, PLC, UK).
3. **Similar:** same once words like Group or Holdings are dropped. Shown as "Likely".
4. **Brand:** same leading words once descriptors (Bank, Technology, Payments…) are dropped, unless the two names state different lines of business (bank vs consulting). Shown as "Likely".
5. **Trading name:** matches the part after "t/a".
6. **Typo:** one character different in one word of six letters or more.

Candidates are ranked by words shared with the name on LinkedIn. When several different companies fit, the badge shows "?" and the hover lists the alternatives; right-click → "Link to a register entry" fixes it permanently.

## LinkedIn fixtures

- `tests/fixtures/live-structure-2026-search.html` mirrors the real `/jobs/search-results/` layout as of 2026-11-10: tags, attributes and nesting are real, text is replaced.
- `tests/fixtures/synthetic-*.html` are hand-written stand-ins for the older class-based layout.

LinkedIn renders pages with JavaScript, so "Save Page As" does not capture what you see. To capture a page when the layout changes, open the DevTools console on it and run `copy(document.documentElement.outerHTML)`, then `pbpaste > tests/fixtures/<name>.html`. Captured pages contain your own profile details, so keep them out of any public repo.
