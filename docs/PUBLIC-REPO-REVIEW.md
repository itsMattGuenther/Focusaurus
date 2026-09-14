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
- Historical author metadata included a personal email address. At the owner's
  request, it was replaced with the account's GitHub noreply address throughout
  all five remote branches and the local checkout. The rewrite examined 38
  commits and 543 reachable objects, found no remaining personal email in the
  sanitized objects, and verified that every commit's file tree was unchanged.
  GitHub-retained pull-request refs and cached commits require separate cleanup;
  rewriting branches alone does not make this repository ready to publish.
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
noreply email. Commit author names and the GitHub account still identify their
authors; email cleanup does not provide anonymity.

## Privacy cleanup and publication hold

The repository remains private. Private backups of the original history and
GitHub records are stored outside the project. Eighteen old Actions records
containing the personal email were removed after their logs and artifacts were
backed up.

All eight historical pull requests reference history affected by the rewrite;
seven still exposed the email through their commit API responses after branch
cleanup. GitHub controls those retained refs and cached commit views. Before
making this existing repository public, request their removal through GitHub Support and
verify the result. GitHub decides whether a request qualifies for sensitive-data
removal; do not assume a request will be accepted. Alternatively, publish a
fresh independent repository with sanitized history and keep the original
repository private, so its old pull requests and workflow metadata stay private.
See [GitHub's removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Any other checkout created before the rewrite, including the original Windows
checkout, still contains the old history. Preserve any uncommitted work privately
and clone afresh before contributing. Merging or pushing old branches can
reintroduce the removed email. Configure the noreply commit email on each machine;
the setting in this checkout does not apply elsewhere.

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
