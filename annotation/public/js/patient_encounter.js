frappe.ui.form.on('Patient Encounter', {
    refresh: function(frm) {
        if (frm.doc.patient) {
            annotation.setup_annotation_button(frm);
        }
    }
});
