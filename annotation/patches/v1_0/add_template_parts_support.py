import frappe


def execute():
    """Add 'Template Parts' as an option to Health Annotation.annotation_type if not already present."""
    if not frappe.db.exists("DocType", "Health Annotation"):
        return

    meta = frappe.get_meta("Health Annotation")
    annotation_type_field = meta.get_field("annotation_type")

    if not annotation_type_field:
        return

    current_options = annotation_type_field.options or ""
    options_list = [opt.strip() for opt in current_options.split("\n") if opt.strip()]

    if "Template Parts" in options_list:
        return

    options_list.append("Template Parts")
    new_options = "\n".join(options_list)

    frappe.make_property_setter({
        "doctype": "Health Annotation",
        "fieldname": "annotation_type",
        "property": "options",
        "value": new_options,
        "property_type": "Text",
    })

    frappe.db.commit()
