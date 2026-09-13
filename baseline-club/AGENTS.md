# Baseline Club project constraints

- Do not add, edit, delete, enable, disable, manually dispatch, rerun or cancel
  GitHub Actions workflows unless the user explicitly requests that action.
  Do not use the user's Actions runners as a substitute for local tooling.
- Every potentially long-running command must have an explicit timeout.
  Bound network retries, animation conversion, browser tests and builds.
  A timeout must produce a visible failure, never a success report.
- Preserve offline HTML delivery and the existing gameplay modes.
- Character art is a primary product requirement. Use professional-source
  assets and verify their adaptations; increasing triangle count on a
  primitive character is not an acceptable replacement.
- Keep player-facing credits in About. Preserve actual license documents
  and provenance in the source project.
- Default automatic shots derive velocity/spin from contact state. Do not
  silently solve toward a selected landing point in that mode or steer a
  ball after launch. Manual targeting is a distinct explicit mode.
- Report exactly what was tested. Do not equate a software-rendered browser
  test or responsive emulation with real-phone frame-rate certification.
