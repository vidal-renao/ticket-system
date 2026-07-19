# Administration UI/UX Audit — 2026-07-19

## Scope

Authenticated administration surfaces at desktop and narrow mobile viewports: ticket operations, workflow stages, filtering, user directory, employee provisioning and company/customer provisioning.

## Design direction

HelpDesk AI remains a Swiss support operations control room: graphite operational surfaces, signal blue for controlled actions, restrained status colors, Aptos/Segoe UI for reading and Cascadia Code for identifiers. Account creation is presented as an identity-provisioning dossier rather than a generic marketing modal.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | The 714 px provisioning modal was vertically centered in a 667 px viewport, producing a negative top position and an unreachable footer. | Fixed with a `100dvh`-bounded mobile sheet and independently scrollable form body. |
| P1 | The modal lacked dialog semantics, an accessible close name, focus containment and background scroll lock. | Fixed with dialog labelling, initial focus, focus trap, Escape handling, named controls and scroll restoration. |
| P1 | Administration header actions rendered beyond the narrow main viewport. | Fixed with responsive wrapping/grid behavior and full-width mobile actions. |
| P1 | The user table was approximately 512 px wide inside a 378 px container with `overflow-hidden`, clipping roles and actions. | Fixed with mobile directory cards and a desktop-only table. |
| P2 | The ticket operations table clipped dense assignment/review controls on narrow screens. | Fixed with a contained horizontal viewport and an explicit minimum operational width. |
| P2 | Workflow tabs scrolled horizontally without communicating selected state. | Fixed with a labelled stage region, overscroll containment and `aria-pressed`. |
| P2 | Several provisioning labels were visual-only and the password visibility action was removed from keyboard order. | Fixed with `htmlFor`/IDs, autocomplete hints and an accessible password visibility control. |

## Follow-up

- Complete a dedicated DE/EN/ES copy sweep for administration strings; this change preserves existing vocabulary to avoid mixing localization work with layout risk.
- Add automated component accessibility checks when a browser component-test harness is introduced.
