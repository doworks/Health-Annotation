import json
import frappe
from frappe.model.document import Document


class AnnotationTemplatePart(Document):
    def validate(self):
        self.validate_required_fields()
        self.validate_shape_json()

    def validate_required_fields(self):
        if not self.part_name:
            frappe.throw("Part Name is required")
        if not self.template:
            frappe.throw("Template is required")

    def validate_shape_json(self):
        if not self.shape_json:
            frappe.throw("Shape JSON is required")

        try:
            coords = json.loads(self.shape_json)
        except (json.JSONDecodeError, TypeError):
            frappe.throw("Shape JSON must be valid JSON")

        if not isinstance(coords, list):
            frappe.throw("Shape JSON must be an array of coordinate pairs")

        for i, point in enumerate(coords):
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                frappe.throw(f"Each coordinate must be a pair [x, y], got invalid entry at index {i}")

            x, y = point
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                frappe.throw(f"Coordinates must be numbers, got invalid values at index {i}")

            if x < 0 or x > 1 or y < 0 or y > 1:
                frappe.throw(
                    f"Coordinates must be relative (0-1 range), got ({x}, {y}) at index {i}. "
                    "Store coordinates relative to the template image dimensions."
                )
