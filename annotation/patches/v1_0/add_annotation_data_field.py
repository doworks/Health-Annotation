import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    """Add annotation_data custom field to Health Annotation Table."""
    if not frappe.db.exists("DocType", "Health Annotation Table"):
        return

    create_custom_fields(
        {
            "Health Annotation Table": [
                {
                    "fieldname": "annotation_data",
                    "fieldtype": "Small Text",
                    "label": "Annotation Data",
                    "insert_after": "type",
                },
            ]
        }
    )
