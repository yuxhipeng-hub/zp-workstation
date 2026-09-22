# ZP Workbench Design System

## Direction

ZP Workbench is a calm desktop productivity workspace. It should feel precise,
quiet, and native rather than like a dashboard template.

Primary reference: Apple desktop software.
Secondary reference: Linear for dense lists and navigation clarity.

## Principles

1. Content comes before decoration.
2. Use fewer surfaces. A page should normally have one main surface per column.
3. Use spacing, dividers, and type hierarchy before adding another card.
4. Motion explains state changes. It should not be a page entrance performance.
5. The colorful `zp` mark is the only intentionally expressive brand element.
6. Chinese text must remain comfortable on Windows at 100%, 125%, and 150% scaling.

## Color

- The interface uses a neutral gray foundation.
- Blue is the single interaction accent.
- Semantic green, amber, and red are reserved for status.
- File types use Apple system-color roles: document blue, PDF red, sheet
  green, slides orange, image purple, archive yellow, and code indigo.
- Semantic icon colors must render at full saturation. Do not mix them toward
  secondary gray; that makes file types look muddy on dark surfaces.
- Gradients are not used for panels, buttons, or page backgrounds.
- The dotted workspace background may remain, but it must stay quieter than content.

## Materials

- Glass is neutral first, blurred second, colored last.
- A glass chip uses a neutral material, a crisp 1px border, a subtle inner
  highlight, and a real backdrop blur.
- Compact status badges use a neutral translucent fill without a border,
  backdrop blur, or glow. Reserve glass treatment for floating surfaces.
- In-page banners, update notices, and status rows use opaque panels. Backdrop
  blur is reserved for the toolbar, menus, and truly floating surfaces.
- Semantic color appears as a small dot, icon, or short text accent. It does not
  fill the whole chip with a low-saturation color wash.
- Colored translucent pills are not part of the visual language.

## Icons And Status

- File types use a neutral document tile with a Lucide document glyph. The
  semantic color belongs to the glyph and a short extension label, not a
  colored card background.
- File tiles are borderless. Their separation comes from a subtle neutral fill,
  not from an outline.
- Task state uses a thin outlined circle without glow or halo.
- A task due-date badge is text-only. Do not repeat the task state as a solid
  dot inside the badge.
- Icons should remain legible at 16-20px and should not depend on color alone.

## Typography

Primary family: Inter Variable.
Chinese family: Noto Sans SC Variable.

Type scale:

| Role          |    Size |  Weight |
| ------------- | ------: | ------: |
| Caption       | 11-12px | 500-600 |
| Body          | 13-14px | 400-500 |
| Navigation    |    13px |     500 |
| Section title | 16-18px |     600 |
| Page title    | 24-26px |     650 |
| Hero title    | 30-34px |     680 |

Rules:

- Do not use 8-10px text for instructions or normal metadata.
- List titles use 14px and metadata uses 12px. Secondary metadata should remain
  readable instead of receding into low-contrast gray.
- Use monospace only for time, paths, code, and numeric diagnostics.
- Uppercase labels must be rare and should use normal text spacing.
- Body line height stays between 1.5 and 1.7.

## Spacing And Shape

- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Controls: 40px height.
- Small radius: 8px.
- Standard radius: 12px.
- Large surface radius: 16px.
- Cards should not be nested inside other decorative cards.

## Motion

- Fast feedback: 120-150ms.
- Standard state change: 180-220ms.
- Surface entrance: 240-280ms.
- Use transform and opacity only for continuous animation.
- Avoid animating layout dimensions, box shadows, or colors on dense scrolling views.
- Respect `prefers-reduced-motion`.

## Navigation

- Sidebar labels use the normal UI font.
- The active item uses the saturated system accent with white icon and text,
  matching macOS sidebar selection.
- Section labels are readable at 11px or above.
- Sidebar width should remain between 228px and 240px on desktop.

## Desktop Shell

- The top bar is a unified toolbar rather than a row of independent controls.
- Toolbar controls share one restrained glass surface with internal spacing.
- The main page canvas uses grouped sections and dividers before cards.
- Notifications and menus may use stronger glass because they float above
  content; ordinary panels remain mostly opaque.

## Page Header

The top bar owns the page title and description. Do not repeat the same title in
the first content section. The content area starts with actions or real content.

## Reusable Canvas Primitives

New pages should compose from the shared canvas primitives instead of rebuilding
cards and separators:

- `workbench-canvas`: the page's single outer surface, border, and large radius.
- `canvas-heading-group`: the two-column title and contextual action area.
- `canvas-heading`: the page's main heading, summary, and optional kicker.
- `canvas-context`: the compact "next step" or contextual action column.
- `canvas-split`: the main column layout separated by one vertical rule.
- `canvas-column`: a vertical group of related sections.
- `canvas-section`: one section inside a column, separated by horizontal rules.

Rules:

- A page should normally use one `workbench-canvas`, not a collection of cards.
- Every non-Today route uses a single `route-canvas`; inner modules are grouped
  with dividers and spacing instead of separate floating cards.
- Internal sections use separators and spacing, not their own outer borders.
- Separators inside a canvas use reduced-contrast lines; they should support the
  grouping without becoming the dominant visual element.
- A canvas context area should always contain a real next action or status; do
  not leave a large empty panel when there is nothing to show.
- List separators are drawn as straight lines. Rounded row backgrounds must not
  create curved dividers.

## Sample Pages

The first approved sample set is:

1. Today
2. Schedule
3. Settings

These pages establish the component and spacing rules before the remaining
features are migrated.

## Migration Status

All product routes now share the same surface and component rules:

- Page-level content uses one consistent 16px surface treatment.
- Repeated rows and compact controls use 12px or 8px radii.
- Ordinary panels are opaque and use low-contrast borders without shadows.
- Dense row lists use straight dividers instead of separate floating cards.
- Semantic colors appear as small dots, icons, or status text rather than
  colored card borders and left stripes.
- Empty and loading states use neutral material instead of dashed outlines.
- Normal metadata is at least 11px; explanatory copy is at least 12px.

## Accessibility

- Normal text contrast meets 4.5:1.
- Every interactive control has visible keyboard focus.
- Icon-only controls have accessible labels.
- Loading, dragging, saving, and failure states remain explicit.
- Interactions must not depend on hover alone.
