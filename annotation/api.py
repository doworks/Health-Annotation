import frappe
import json
import base64
from frappe.utils.file_manager import save_file

@frappe.whitelist()
def annotations_records():
    templates = frappe.db.get_list('Annotation Template', fields= ['label', 'gender', 'kid', 'image', 'name'], order_by='creation asc',)
    treatments = frappe.db.get_list('Annotation Treatment', fields= ['treatment', 'name', 'color'])
    for treatment in treatments:
        treatment.variables = frappe.db.get_all('Treatment Variables Table', fields=['variable_name', 'type', 'options'], filters={'parent': treatment.name})

    for template in templates:
        parts = frappe.get_all('Annotation Template Part',
            filters={'template': template.name},
            fields=['name', 'part_name', 'shape_json', 'color', 'opacity'])
        for part in parts:
            part.variables = frappe.get_all('Template Part Variable',
                filters={'parent': part.name},
                fields=['variable_name', 'type', 'options'])
        template.parts = parts

    return {'templates': templates, 'treatments': treatments}

@frappe.whitelist()
def get_annotation_history(doctype, docname):
    patient = frappe.db.get_value(doctype, docname, 'patient')
    encounter_records = frappe.get_all('Patient Encounter', filters={'patient': patient}, fields=['name'])
    procedure_records = frappe.get_all('Clinical Procedure', filters={'patient': patient}, fields=['name'])

    child_records = []
    for encounter in encounter_records:
        if frappe.db.exists('Patient Encounter', encounter['name']):
            child_records += frappe.get_all('Health Annotation Table', filters={'parent': encounter['name']}, fields=['annotation'])
    for procedure in procedure_records:	
        if frappe.db.exists('Clinical Procedure', procedure['name']):
            child_records += frappe.get_all('Health Annotation Table', filters={'parent': procedure['name']},fields=['annotation'])

    annotations = []
    for record in child_records:
        annotations += frappe.get_all('Health Annotation', 
                                filters={'name': record['annotation']}, 
                                fields=['name', 'annotation_template', 'image', 'json', 'creation'], 
                                order_by='creation')
    return annotations

@frappe.whitelist()
def save_annotation(docname, doctype, annotation_template, annotation_name=None, encounter_type='', file_data=None, json_text='', annotation_type='Free Drawing'):
    if not file_data:
        frappe.throw("File data is missing")

    if annotation_name and frappe.db.exists("Health Annotation", annotation_name):
        health_annotation = frappe.get_doc('Health Annotation', annotation_name)
        health_annotation.annotation_template = annotation_template
        health_annotation.annotation_type = annotation_type
        health_annotation.json = json_text
    else:
        health_annotation = frappe.new_doc('Health Annotation')
        health_annotation.annotation_type = annotation_type
        health_annotation.annotation_template = annotation_template
        health_annotation.json = json_text
        health_annotation.insert()

        doc = frappe.get_doc(doctype, docname)
        doc.append("custom_annotations", {
            "annotation": health_annotation.name,
            "type": encounter_type,
        })
        doc.flags.ignore_mandatory = True
        doc.flags.ignore_validate_update_after_submit = True
        doc.save()

    # Parse the data URL to get the file type and the Base64 data
    if file_data.startswith('data:image'):
        header, base64_data = file_data.split(',', 1)
        # Extract the file extension from the header
        extension = header.split('/')[1].split(';')[0]
        file_name = f"annotation.{extension}"
    else:
        frappe.throw("Invalid file data")

    # Decode the Base64 string
    file_content = base64.b64decode(base64_data)

    # Save the file
    # file_doc = save_file(file_name, file_content, health_annotation.doctype, health_annotation.name, is_private=1, df='image')

    # Update the doctype with the file URL
    health_annotation.image = save_file(file_name, file_content, health_annotation.doctype, health_annotation.name, is_private=1, df='image').file_url
    health_annotation.save()

    # return {"file_url": file_doc.file_url}


@frappe.whitelist()
def get_annotation_summary(doctype, docname):
    patient = frappe.db.get_value(doctype, docname, 'patient')
    if not patient:
        return []

    encounter_records = frappe.get_all('Patient Encounter', filters={'patient': patient}, fields=['name'])
    procedure_records = frappe.get_all('Clinical Procedure', filters={'patient': patient}, fields=['name'])

    child_records = []
    for encounter in encounter_records:
        child_records += frappe.get_all('Health Annotation Table', filters={'parent': encounter['name']}, fields=['annotation'])
    for procedure in procedure_records:
        child_records += frappe.get_all('Health Annotation Table', filters={'parent': procedure['name']}, fields=['annotation'])

    if not child_records:
        return []

    annotation_names = list(set([r['annotation'] for r in child_records]))

    annotations = frappe.get_all('Health Annotation',
        filters={'name': ['in', annotation_names]},
        fields=['name', 'annotation_template', 'image', 'creation'],
        order_by='creation desc')

    # Fetch template labels
    template_names = list(set([a['annotation_template'] for a in annotations if a.get('annotation_template')]))
    template_labels = {}
    if template_names:
        templates = frappe.get_all('Annotation Template',
            filters={'name': ['in', template_names]},
            fields=['name', 'label'])
        template_labels = {t['name']: t['label'] for t in templates}

    for anno in annotations:
        anno['template_label'] = template_labels.get(anno.get('annotation_template'), '')

    return annotations


@frappe.whitelist()
def save_template_parts(template, parts):
    """Save/update template parts for an annotation template.

    Args:
        template: Name of the Annotation Template
        parts: JSON string - array of part objects with:
            - name (optional, for updates)
            - part_name
            - shape_json
            - color
            - opacity
            - variables: array of {variable_name, type, options}
    """
    if not frappe.db.exists("Annotation Template", template):
        frappe.throw(f"Annotation Template '{template}' does not exist")

    if isinstance(parts, str):
        parts = json.loads(parts)

    if not isinstance(parts, list):
        frappe.throw("parts must be an array of part objects")

    # Collect incoming part names (for existing parts being updated)
    incoming_names = {p["name"] for p in parts if p.get("name")}

    # Delete parts for this template that are not in the incoming list
    existing_parts = frappe.get_all("Annotation Template Part",
        filters={"template": template},
        fields=["name"])
    for existing in existing_parts:
        if existing.name not in incoming_names:
            frappe.delete_doc("Annotation Template Part", existing.name)

    saved_parts = []
    for part_data in parts:
        if part_data.get("name") and frappe.db.exists("Annotation Template Part", part_data["name"]):
            doc = frappe.get_doc("Annotation Template Part", part_data["name"])
        else:
            doc = frappe.new_doc("Annotation Template Part")
            doc.template = template

        doc.part_name = part_data.get("part_name")
        doc.shape_json = part_data.get("shape_json") if isinstance(part_data.get("shape_json"), str) else json.dumps(part_data.get("shape_json"))
        doc.color = part_data.get("color", "#4dabf7")
        doc.opacity = part_data.get("opacity", 0.2)

        # Replace variables child table
        doc.variables = []
        for var in part_data.get("variables", []):
            doc.append("variables", {
                "variable_name": var.get("variable_name"),
                "type": var.get("type"),
                "options": var.get("options"),
            })

        doc.save()
        saved_parts.append(doc.name)

    # Return the saved parts with full data
    result = []
    for part_name in saved_parts:
        part = frappe.get_doc("Annotation Template Part", part_name)
        result.append({
            "name": part.name,
            "part_name": part.part_name,
            "shape_json": part.shape_json,
            "color": part.color,
            "opacity": part.opacity,
            "variables": [
                {"variable_name": v.variable_name, "type": v.type, "options": v.options}
                for v in part.variables
            ],
        })

    return result