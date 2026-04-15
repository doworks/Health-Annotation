import * as React from "react";
import TemplatePartEditor from "../annotation/TemplatePartEditor";
import { createRoot } from "react-dom/client";

class TemplatePartEditorPage {
	constructor({ page, wrapper }) {
		this.$wrapper = $(wrapper);
		this.page = page;
		this.init();
	}

	init() {
		this.setup_page_actions();
		this.setup_app();
	}

	setup_page_actions() {
		// Save action handled inside the React component
	}

	setup_app() {
		const root = createRoot(this.$wrapper.get(0));
		root.render(<TemplatePartEditor />);
		this.$editor = root;
	}
}

frappe.provide("frappe.ui");
frappe.ui.TemplatePartEditor = TemplatePartEditorPage;
export default TemplatePartEditorPage;
