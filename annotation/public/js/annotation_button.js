// Annotation button for Patient Encounter and Clinical Procedure forms
frappe.provide('annotation');

annotation.setup_annotation_button = function(frm) {
    if (!frm.doc.patient) return;
    
    frappe.call({
        method: "annotation.api.get_annotation_summary",
        args: { doctype: frm.doctype, docname: frm.docname },
        callback: function(r) {
            if (!r.message) return;
            
            const annotations = r.message;
            const count = annotations.length;
            
            // Remove existing button if re-rendering
            frm.remove_custom_button(__('Annotations'));
            
            const btn = frm.add_custom_button(
                __(`Annotations (${count})`),
                function() {
                    annotation.show_annotations_dialog(frm, annotations);
                }
            );
            
            // Style the button
            if (count > 0) {
                btn.removeClass('btn-default').addClass('btn-primary-light');
            }
        }
    });
};

annotation.show_annotations_dialog = function(frm, annotations) {
    let html = '';
    annotation._annotation_data_map = {};
    
    if (annotations.length === 0) {
        html = '<div class="text-muted text-center" style="padding: 30px;">No annotations found for this patient.</div>';
    } else {
        html = '<div style="max-height: 70vh; overflow-y: auto;">';
        annotations.forEach(function(anno) {
            const date = frappe.datetime.str_to_user(anno.creation);
            const templateLabel = anno.template_label || anno.annotation_template || 'Unknown';
            const imageSrc = anno.image || '/assets/frappe/images/default-image.png';
            annotation._annotation_data_map[anno.name] = anno.annotation_data || '';
            
            html += `
                <div style="border-bottom: 1px solid var(--border-color);">
                    <div class="annotation-card" style="display: flex; align-items: center; padding: 10px; gap: 12px;">
                        <img src="${imageSrc}" 
                             alt="${templateLabel}" 
                             style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid var(--border-color);"
                             onclick="annotation.show_image_preview('${imageSrc}', '${templateLabel}', '${anno.name}')" />
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">${templateLabel}</div>
                            <div class="text-muted" style="font-size: 12px;">${date}</div>
                        </div>
                        <button class="btn btn-xs btn-default" 
                                onclick="annotation.open_annotation_editor('${frm.doctype}', '${frm.docname}', '${anno.name}')">
                            ${__('Edit')}
                        </button>
                    </div>
                    ${anno.annotation_data ? `<div style="padding: 4px 10px 10px 10px; background: var(--subtle-fg); border-radius: 0 0 4px 4px;">${anno.annotation_data}</div>` : ''}
                </div>`;
        });
        html += '</div>';
    }
    
    const dialog = new frappe.ui.Dialog({
        title: __(`Patient Annotations (${annotations.length})`),
        size: 'large',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'annotations_html',
                options: html
            }
        ],
        primary_action_label: __('New Annotation'),
        primary_action: function() {
            const url = `/app/annotation?doctype=${encodeURIComponent(frm.doctype)}&docname=${encodeURIComponent(frm.docname)}`;
            window.open(url, '_blank');
            dialog.hide();
        }
    });
    
    dialog.show();
};

annotation.show_image_preview = function(imageSrc, title, annoName) {
    const annotationData = (annoName && annotation._annotation_data_map) ? annotation._annotation_data_map[annoName] : '';
    let contentHtml;
    if (annotationData) {
        contentHtml = `
        <style>
            @media (max-width: 768px) {
                .annotation-preview-layout { flex-direction: column !important; }
                .annotation-preview-layout > div { flex: 1 1 100% !important; }
            }
        </style>
        <div class="annotation-preview-layout" style="display: flex; flex-wrap: wrap; gap: 16px; padding: 10px;">
            <div style="flex: 0 0 58%; text-align: center;">
                <img src="${imageSrc}" style="max-width: 100%; max-height: 70vh; border-radius: 4px;" />
            </div>
            <div style="flex: 1; overflow-y: auto; max-height: 70vh; font-size: 13px;">
                ${annotationData}
            </div>
        </div>`;
    } else {
        contentHtml = `<div style="text-align: center; padding: 10px;">
            <img src="${imageSrc}" style="max-width: 100%; max-height: 70vh; border-radius: 4px;" />
        </div>`;
    }
    const d = new frappe.ui.Dialog({
        title: title,
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'image_preview',
                options: contentHtml
            }
        ]
    });
    d.show();
    d.$wrapper.find('.modal-dialog').css('max-width', annotationData ? '95vw' : '90vw');
};

annotation.open_annotation_editor = function(doctype, docname, annotation_name) {
    const url = `/app/annotation?doctype=${encodeURIComponent(doctype)}&docname=${encodeURIComponent(docname)}&annotation_name=${encodeURIComponent(annotation_name)}`;
    window.open(url, '_blank');
};
