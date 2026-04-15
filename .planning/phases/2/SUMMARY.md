---
phase: 2
plan: 1
status: complete
tasks_completed: 4/4
commits: [2614d3b]
files_modified:
  - annotation/annotation/page/template_part_editor/__init__.py
  - annotation/annotation/page/template_part_editor/template_part_editor.json
  - annotation/annotation/page/template_part_editor/template_part_editor.js
  - annotation/public/js/annotation/TemplatePartEditor.jsx
  - annotation/public/js/template-part-editor/TemplatePartEditor.bundle.jsx
deviations: []
decisions:
  - No hooks.py changes needed — Frappe pages auto-load their JS from the module directory
  - Used line tool (`type: 'line'`) for polygon drawing, matching Excalidraw patterns
  - Sidebar is inline HTML/CSS rather than MUI Joy to keep the bundle simpler and self-contained
---

# Phase 2 Summary — Admin Template Part Authoring

## What Was Done

### 1. Frappe Page: template-part-editor
Created `annotation/annotation/page/template_part_editor/` with:
- `template_part_editor.json` — Page definition (name: `template-part-editor`, module: Annotation)
- `template_part_editor.js` — Mounts the React component via `frappe.require('template-part-editor.bundle.jsx')`
- `__init__.py` — Python module init

Route: `/app/template-part-editor?template=TEMPLATE_NAME`

### 2. React Component: TemplatePartEditor.jsx
Full-featured editor component that:
- Reads `?template=` from URL and fetches the Annotation Template doc
- Loads the template image into Excalidraw canvas (same pattern as App.jsx `handleImageClick`)
- Fetches existing `Annotation Template Part` records and their `Template Part Variable` children
- Renders existing parts as Excalidraw line elements with correct color/opacity
- Detects new completed line drawings and auto-creates part entries
- Right sidebar with:
  - Parts list with color swatch indicators
  - Click-to-expand part detail: name input, color picker, opacity slider
  - Variables section: add/remove variables with name, type (Data/Select), and options
  - Delete part button (removes from canvas + state)
  - Save All button that calls `annotation.api.save_template_parts`
- Visual feedback: selected part highlighted, polygon stroke/fill update in real-time
- Save persists full Excalidraw element JSON as `shape_json` for round-trip reconstruction

### 3. Bundle Entry
Created `annotation/public/js/template-part-editor/TemplatePartEditor.bundle.jsx` following the same pattern as `annotation.bundle.jsx` — imports the React component, wraps in a Frappe UI class, and provides to `frappe.ui.TemplatePartEditor`.

### 4. Build Verification
- `bench build --app annotation` succeeds
- `bench --site health.localhost migrate` succeeds (page registered)
- Bundle output: `TemplatePartEditor.bundle.HKYNYNZL.js` (19.5MB)

## Verification
- Build: ✅ Clean build with both bundles produced
- Migration: ✅ Page synced to database
- Route: `/app/template-part-editor?template=789hv7o68o` should load the Face template
