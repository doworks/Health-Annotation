---
phase: 1
plan: 1
status: complete
tasks_completed: 3/3
commits: [1908b03, cf74342, bde7c6b]
files_modified:
  - annotation/annotation/doctype/__init__.py
  - annotation/annotation/doctype/annotation_template_part/__init__.py
  - annotation/annotation/doctype/annotation_template_part/annotation_template_part.json
  - annotation/annotation/doctype/annotation_template_part/annotation_template_part.py
  - annotation/annotation/doctype/template_part_variable/__init__.py
  - annotation/annotation/doctype/template_part_variable/template_part_variable.json
  - annotation/annotation/doctype/template_part_variable/template_part_variable.py
  - annotation/patches/v1_0/__init__.py
  - annotation/patches/v1_0/add_template_parts_support.py
  - annotation/patches.txt
  - annotation/api.py
deviations: []
decisions:
  - "Used frappe.make_property_setter to add Template Parts option to Health Annotation.annotation_type since that doctype is owned externally"
  - "save_annotation() already handles annotation_type passthrough — no changes needed for Template Parts mode"
---

# Phase 1, Plan 1 Summary

## What Was Done

### Task 1: DocType artifacts and migration patch
- Created `Annotation Template Part` standalone DocType with fields: template (Link), part_name (Data), shape_json (Code/JSON), color (Color), opacity (Float), variables (Table → Template Part Variable)
- Created `Template Part Variable` child table with fields: variable_name (Data), type (Select: Select/Data), options (Small Text)
- Controller validates shape_json is valid JSON array of relative coordinate pairs (0-1 range)
- Migration patch adds "Template Parts" to Health Annotation.annotation_type via property_setter (migration-safe for external doctype)
- Patch registered in patches.txt under [post_model_sync]

### Task 2: Extended annotations_records() and verified save_annotation()
- `annotations_records()` now fetches template parts and nested variables for each template, returned inline under `template.parts`
- Existing treatments payload preserved — no regression
- `save_annotation()` already sets `annotation_type` from parameter (default "Free Drawing"), works with "Template Parts" without changes

### Task 3: save_template_parts() CRUD endpoint
- New whitelisted endpoint accepts template name and JSON array of parts
- Deletes existing parts not in incoming list (handles removal)
- Creates or updates parts with child variable rows
- Returns saved parts with full nested variable data
- Validates template existence and parts format

## Deviations
None.

## Decisions
- Health Annotation.annotation_type is externally owned — used `frappe.make_property_setter` in a versioned patch rather than editing doctype JSON directly
- save_annotation() required no changes for Template Parts support since annotation_type is already passed through

## Verification
- `bench build --app annotation` — successful
- `bench --site health.localhost migrate` — successful, both doctypes created, patch applied
- Console verification confirmed:
  - Annotation Template Part has correct 6 fields, module = Annotation
  - Template Part Variable has correct 3 fields, istable = 1
  - Health Annotation.annotation_type includes "Template Parts"
  - annotations_records() returns templates with nested parts + treatments preserved
