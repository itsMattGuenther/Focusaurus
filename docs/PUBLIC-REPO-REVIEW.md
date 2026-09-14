# Public repository review · September 14, 2026

This review covers the transition from a private development repository to a
public project. It does not replace Chrome Web Store review or claim that an
automated scanner can prove the absence of every possible secret.

## Scope and results

- Enumerated all local and fetched remote Git refs: 36 reachable commits at the
  start of review, including older development branches. Gitleaks 8.30.1 scanned
  the history (29 non-merge commits); no credential findings.
- Examined historical filenames and blob content for signing keys, environment
  files, credentials, profile databases and exported settings. None were tracked.
  Checked binary image metadata separately: older icons contain editing-tool
  names and timestamps, with no personal contact or location metadata found.
- Reviewed all seven historical pull requests and their available comments and
  reviews. No sensitive attachments or credentials found.
- Retrieved all 23 existing Actions runs and 32 unexpired artifacts, with no
  download failures. Extracted the artifacts, including nested extension ZIPs,
  and scanned the contents and logs: no credential findings.
- No releases, wiki, Pages site, discussion area or repository forks existed
  at the time of review. These were checked as additional publication surfaces.
- Historical author metadata includes a personal email address. Its publication
  preference is a separate owner decision; a current `.gitignore` cannot remove
  information from Git history or old workflow metadata.
- An older design document mentions a former local key-storage directory. No
  signing key or its contents appears in the history. Local path references and
  image-editor timestamps are not credentials.

Raw downloaded metadata and scanner reports were kept outside the repository.
They are not included in public files or extension packages.

## Prevention and public-facing preparation

The README now introduces the product, everyday features, privacy, installation,
and ways to help. Development commands moved to `DEVELOPMENT.md`. Contributor
instructions, issue forms, a readable copy of the privacy policy, and a Chrome
publishing checklist accompany it.

The repository ignore rules now also cover common environment files, signing
containers, local npm configuration, browser authentication state, HAR captures,
and SQLite/profile databases. Future commits in this checkout use GitHub's
noreply email. This does not rewrite existing author attribution.

Private vulnerability reporting and GitHub's secret scanning/push protection
should be enabled when the repository becomes public. Repository visibility
is independent of Chrome Web Store visibility: an Unlisted pilot can still
have a public source repository.

## Release preparation finding

The latest main-branch Chrome workflow exposed a settings startup race:
`Clear history` and appearance handlers were registered after the initial
background read. A click during that read could be ignored. All handlers are
now registered first. The existing browser regression holds the first reply,
clicks the control, and verifies the confirmation still appears; it fails on
the original code and passes on the fix.
