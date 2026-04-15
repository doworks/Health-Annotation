---
phase: 3
status: complete
tasks_completed: 8/8
commits: [966bad2, 84235ae]
files_modified: [annotation/public/js/annotation/App.jsx, annotation/api.py]
deviations:
  - "Fixed api.py to also update annotation_type on existing annotation saves (was only set on new docs)"
decisions: []
---

# Phase 3: Practitioner Annotation Workflow Summary

## What Was Done

Integrated template parts into the practitioner-facing annotation editor (App.jsx) so practitioners can interact with predefined polygon regions on templates.

### 1. Helper Functions
- `hexWithAlpha(hex, opacity)` — converts hex color + opacity to hex with alpha channel
- `createPartElements(parts, scaleFactor, imageX, imageY, currentPartValues)` — generates Excalidraw `line` elements (closed polygons) from template part definitions, transforming image-relative coordinates to canvas coordinates

### 2. State Management
- `templateParts` — current template's part definitions
- `partValues` — map of `{ partName: { varName: value } }` for entered values
- `selectedPart` — currently clicked part's customData

### 3. Part Rendering (handleImageClick)
When a template with parts is selected, part polygons are rendered as locked line elements with:
- Coordinates scaled using the same scaleFactor/imageX/imageY as the template image
- Solid fill with semi-transparent color from part definition
- `customData.partType = 'template_part'` for identification

### 4. Part Selection (handleExcaliPointerDown)
Extended pointer-down handler to detect clicks on template part line elements:
- Sets `selectedPart` and clears treatment selection
- Calls `updatePartVisuals()` to highlight selected part (thicker border, higher opacity)
- Clicking elsewhere resets visuals via `resetPartVisuals()`

### 5. Part Variables Sidebar
When a part is selected, a Card component renders on the right side showing:
- Part name as header
- Variable inputs (Select dropdowns, Data text inputs)
- Values stored in `partValues` state using functional updates

### 6. Save Flow
- Template part polygons are filtered out of saved elements (reconstructed on load)
- `partValues` included in saved JSON alongside elements
- `annotation_type` determined dynamically: 'Template Parts' if any part values exist, else 'Free Drawing'
- `annotation_type` passed to `save_annotation()` API

### 7. Load/Import Flow
All three import paths updated:
- **Saved image element path**: extracts scale/position from saved element, reconstructs parts
- **Old format path**: computes scale from canvas, reconstructs parts
- **Legacy/no-template paths**: clears part state

`partValues` restored from saved JSON data.

### 8. API Fix
- `save_annotation()` now updates `annotation_type` on existing annotations (previously only set on creation)

## Deviations
- Fixed existing bug where `annotation_type` was not updated when re-saving an existing annotation

## Verification
- `bench build --app annotation` succeeds with no errors
