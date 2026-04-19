export interface PickOptions {
	preferCamera: boolean;
}

export function pickImage(opts: PickOptions): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		if (opts.preferCamera) {
			input.setAttribute("capture", "environment");
		}
		input.style.position = "fixed";
		input.style.left = "-9999px";
		input.style.top = "-9999px";
		input.style.opacity = "0";
		input.style.pointerEvents = "none";

		let settled = false;
		const cleanup = () => {
			window.removeEventListener("focus", onFocus);
			if (input.parentNode) input.parentNode.removeChild(input);
		};
		const settle = (file: File | null) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(file);
		};

		input.addEventListener("change", () => {
			const file = input.files && input.files[0] ? input.files[0] : null;
			settle(file);
		});

		input.addEventListener("cancel", () => settle(null));

		const onFocus = () => {
			window.setTimeout(() => {
				if (!settled && (!input.files || input.files.length === 0)) {
					settle(null);
				}
			}, 500);
		};
		window.addEventListener("focus", onFocus);

		document.body.appendChild(input);
		input.click();
	});
}
