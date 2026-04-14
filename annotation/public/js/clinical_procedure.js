frappe.ui.form.on('Clinical Procedure', {
    refresh: function(frm) {
        if (frm.doc.patient) {
            annotation.setup_annotation_button(frm);
        }
    }
});
