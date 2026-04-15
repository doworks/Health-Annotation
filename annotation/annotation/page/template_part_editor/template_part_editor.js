frappe.pages["template-part-editor"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Template Part Editor"),
		single_column: true,
	});

	window.process = window.process || {};
	window.process.env = {
		NODE_ENV: "production",
		IS_PREACT: "false",
	};
};

frappe.pages["template-part-editor"].on_page_show = function (wrapper) {
	load_editor_page(wrapper);
};

function load_editor_page(wrapper) {
	let $parent = $(wrapper).find(".layout-main-section");
	$parent.empty();

	frappe.require(["template-part-editor.bundle.jsx"]).then(() => {
		frappe.template_part_editor = new frappe.ui.TemplatePartEditor({
			wrapper: $parent,
			page: wrapper.page,
		});
	});
}
