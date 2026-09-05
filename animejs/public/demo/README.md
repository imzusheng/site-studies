# Luma UI promotional embed

Source: `luma-remote/design/ui/issue-26-landscape-final.html`.
Source file commit: `dae5bea480cf4c350b47605ff0de92c9dfe74e93`.
Source SHA-256: `ff616751b8fc7c9b8f9d31ec8cff83b9d9a47642d08bc1d6a62a2e6400bd8963`.

This is the actual Issue #26 landscape HTML design prototype, referenced by
`docs/interaction-model.md` (V2, frozen 2026-09-03). That document explicitly
replaces V1 LEFT/INFO/RIGHT semantics still mentioned in older AGENTS/bringup text.
The prototype uses six global preset keys and EC11 selection/edit/short-press/
long-press navigation. It is an interactive design preview, not a live device mirror.

The LCD CSS, sample light data, rendering functions and interaction state machine
are retained. The surrounding debug workbench, provisioning/status controls and
global keyboard capture are removed. A small whitelisted postMessage bridge is
added for the website controls. The iframe is sandboxed with scripts only, and
contains no external assets, device endpoints, credentials or network calls.
The parent checks the sending Window; the iframe only accepts its parent.

The original prototype acknowledges scene commands with a toast; it does not
simulate authoritative HA scene responses. This behavior is intentionally retained.
