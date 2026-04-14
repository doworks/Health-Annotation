import frappe
import json


def execute():
    """Strip embedded Base64 template images from Health Annotation JSON to reduce storage.
    
    Before: JSON contains {elements: [image_element, ...freedraw_elements], files: {id: {dataURL: base64...}}}
    After:  JSON contains {elements: [...freedraw_elements]}
    """
    batch_size = 100
    
    # Step 1: Strip files and image elements from Health Annotation JSON
    annotations = frappe.db.sql(
        """SELECT name, json FROM `tabHealth Annotation` 
        WHERE json LIKE '%%dataURL%%' 
        AND annotation_template IS NOT NULL 
        AND annotation_template != ''""",
        as_dict=True
    )
    
    total = len(annotations)
    frappe.log(f"Optimizing {total} Health Annotation records...")
    
    for i in range(0, total, batch_size):
        batch = annotations[i:i + batch_size]
        for record in batch:
            try:
                data = json.loads(record['json'])
                
                # Remove the files object (Base64 template images)
                data.pop('files', None)
                
                # Remove image elements (template background)
                if 'elements' in data:
                    data['elements'] = [el for el in data['elements'] if el.get('type') != 'image']
                
                new_json = json.dumps(data)
                
                frappe.db.sql(
                    "UPDATE `tabHealth Annotation` SET json = %s WHERE name = %s",
                    (new_json, record['name'])
                )
            except (json.JSONDecodeError, Exception) as e:
                frappe.log(f"Skipping {record['name']}: {str(e)}")
                continue
        
        frappe.db.commit()
        frappe.log(f"Processed batch {i // batch_size + 1} of {(total + batch_size - 1) // batch_size}")
    
    # Step 2: Clear json and image fields on Health Annotation Table (bulk)
    frappe.db.sql("UPDATE `tabHealth Annotation Table` SET json = NULL, image = NULL WHERE json IS NOT NULL OR image IS NOT NULL")
    frappe.db.commit()
    
    frappe.log("Health Annotation Table json and image fields cleared.")
    frappe.log("Annotation storage optimization complete.")
