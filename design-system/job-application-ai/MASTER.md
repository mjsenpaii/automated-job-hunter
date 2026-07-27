# Job Application AI — Design System

Generated with UI/UX Pro Max, then adapted to the repository’s explicit
requirements for a calm, professional, data-dense productivity application.

## Design dials

- Variance: 4/10 — balanced and modern
- Motion: 3/10 — subtle, functional transitions only
- Density: 8/10 — compact dashboard information architecture
- Style: flat, minimal, trust-oriented SaaS
- Typography: Inter with system fallbacks

## Core tokens

### Colour

| Role | Value | Use |
| --- | --- | --- |
| Page | `#F4F7FB` | Application background |
| Raised | `#FFFFFF` | Panels, cards, inputs |
| Subtle | `#F8FAFC` | Read-only and grouped regions |
| Strong text | `#10203A` | Headings and key values |
| Body text | `#334155` | Primary reading text |
| Muted text | `#64748B` | Metadata and helper text |
| Border | `#DBE3EE` | Standard boundaries |
| Primary | `#1E40AF` | Primary actions and focus |
| Primary hover | `#1E3A8A` | Hover/pressed action |
| Sidebar | `#111C30` | Persistent desktop navigation |
| Success | `#166534` | Shortlisted and positive states |
| Warning | `#92400E` | Review-required states |
| Danger | `#B91C1C` | Rejected and error states |
| Duplicate | `#6D28D9` | Duplicate state |

Status meaning always includes a text label and marker; colour is never the only
signal.

### Typography

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 12px | Labels, metadata, compact badges |
| `--text-sm` | 14px | Tables, controls, secondary copy |
| `--text-base` | 16px | Body and mobile inputs |
| `--text-lg` | 18px | Section headings |
| `--text-xl` | 22px | Panel headings |
| `--text-2xl` | 26–32px | Page titles |

Body line height is 1.55; long descriptions use 1.75 and stay within a readable
line length.

### Spacing

Use a 4px base:

`4, 8, 12, 16, 20, 24, 32, 40px`

Dashboard panels normally use 16–20px padding. Touch controls are at least 44px
high.

### Shape and elevation

- Small radius: 6px
- Control radius: 10px
- Panel radius: 14px
- Feature/composer radius: 18px
- Small shadow: `0 1px 2px rgb(15 23 42 / 0.05)`
- Raised shadow: `0 8px 24px rgb(15 23 42 / 0.07)`
- Focus ring: 2px primary outline plus a 3px translucent outer ring

Surfaces are solid. Do not use glassmorphism, decorative blur, glowing borders,
or ambient gradients.

## Layout rules

- Desktop sidebar: 228px; tablet sidebar: 204px.
- Desktop and laptop users may collapse the sidebar to a 72px icon rail; preserve
  accessible labels, tooltips, and the local preference. Mobile keeps bottom navigation.
- Content width: maximum 1240px, centred within the remaining viewport.
- Desktop job lists use compact tables.
- At 820px and below, use the four-item bottom navigation and job cards.
- At 1024px, nonessential table columns collapse while required job facts remain.
- Importer review uses main content plus a sticky action panel when space permits.
- Job details use a compact full-width decision bar above a full-width tab workspace;
  do not reintroduce a narrow sticky sidebar or horizontally scrolling detail tabs.
- Long descriptions and source data live behind tabs or bounded secondary areas.
- Fixed mobile navigation always reserves 68px of page padding.

## Interaction rules

- One primary action per decision area.
- Hover and focus states use 180ms transitions without layout movement.
- Enter submits the importer; Shift+Enter inserts a line.
- Async buttons lock while running and show an inline progress indicator.
- Errors explain a recovery action and appear in live regions.
- Tabs support click, Tab, arrow keys, Home, and End where implemented.
- Disabled actions include a visible explanation or descriptive title.
- Respect `prefers-reduced-motion`.

## Component principles

- `Sidebar`: four top-level destinations, consistent icon/label pairs, and an
  accessible persistent desktop collapse/expand control.
- `PageHeader`: eyebrow, page title, concise description, one optional action.
- `MetricCard`: one real value, one short definition, no fake trends.
- `StatusBadge`: canonical label plus marker and semantic tone.
- `JobList`: search, status/setup filters, sorting, bounded rendering.
- `ConversationComposer`: large input, visible key instructions, character count.
- `ExtractionReview`: four tabs, editable structured fields, original input
  isolated as untrusted text.
- `StickyActionPanel`: review status, actual pipeline outcome, explicit confirm.
- `JobDetailWorkspace`: compact title and export actions, a full-width decision bar,
  and equal-width desktop tabs; long content remains isolated by tab.
- `EmptyState`: explain why the view is empty and provide one useful next step.

## Accessibility checklist

- 4.5:1 text contrast minimum.
- Visible labels for every form control.
- Sequential headings and semantic landmarks.
- Keyboard-reachable navigation, tabs, controls, and expandable content.
- 44px minimum practical pointer target.
- No horizontal page scrolling at 390, 768, 1024, or 1440px.
- Loading placeholders reserve space to avoid layout shifts.
- Raw HTML is never rendered as markup.

## Anti-patterns

- No duplicate import navigation.
- No oversized card grids for lists.
- No score `0` substituted for missing scores.
- No invented dates, locations, salary, or rejection reasons.
- No essential rejection information hidden in an accordion.
- No decorative charts or analytics without real data.
- No emoji icons; use the shared stroke icon system.
