// In-app dialog system. Replaces native browser alert() and confirm() pop-ups.
(() => {
    let activeDialog = null;

    function closeDialog(result) {
        if (!activeDialog) return;
        const { overlay, resolve, previousFocus, onKeydown } = activeDialog;
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        activeDialog = null;
        if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
        resolve(result);
    }

    function openDialog(message, options = {}) {
        if (activeDialog) closeDialog(false);

        const {
            title = "Habit Builder Tracker",
            confirmText = "OK",
            cancelText = "Cancel",
            confirm = false,
            danger = false
        } = options;

        return new Promise((resolve) => {
            const previousFocus = document.activeElement;
            const overlay = document.createElement("div");
            overlay.className = "app-dialog-overlay";
            overlay.innerHTML = `
                <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
                    <div class="app-dialog-mark" aria-hidden="true">${danger ? "!" : "✓"}</div>
                    <h2 id="app-dialog-title"></h2>
                    <p id="app-dialog-message"></p>
                    <div class="app-dialog-actions">
                        ${confirm ? '<button type="button" class="app-dialog-cancel"></button>' : ""}
                        <button type="button" class="app-dialog-confirm"></button>
                    </div>
                </section>`;

            overlay.querySelector("#app-dialog-title").textContent = title;
            overlay.querySelector("#app-dialog-message").textContent = String(message ?? "");
            const confirmButton = overlay.querySelector(".app-dialog-confirm");
            confirmButton.textContent = confirmText;
            if (danger) confirmButton.classList.add("is-danger");
            if (confirm) {
                overlay.querySelector(".app-dialog-cancel").textContent = cancelText;
                overlay.querySelector(".app-dialog-cancel").addEventListener("click", () => closeDialog(false));
            }
            confirmButton.addEventListener("click", () => closeDialog(true));
            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) closeDialog(false);
            });

            const onKeydown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeDialog(false);
                } else if (event.key === "Enter" && !confirm) {
                    event.preventDefault();
                    closeDialog(true);
                } else if (event.key === "Tab") {
                    const controls = [...overlay.querySelectorAll("button")];
                    if (!controls.length) return;
                    const first = controls[0];
                    const last = controls[controls.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault(); last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault(); first.focus();
                    }
                }
            };

            activeDialog = { overlay, resolve, previousFocus, onKeydown };
            document.body.appendChild(overlay);
            document.addEventListener("keydown", onKeydown);
            confirm ? overlay.querySelector(".app-dialog-cancel").focus() : confirmButton.focus();
        });
    }



    function openTextConfirm(message, options = {}) {
        if (activeDialog) closeDialog(false);

        const {
            title = "Confirm destructive action",
            confirmText = "Continue",
            cancelText = "Cancel",
            danger = true,
            inputLabel = 'Type DELETE to confirm',
            placeholder = "DELETE",
            expectedText = "DELETE"
        } = options;

        return new Promise((resolve) => {
            const previousFocus = document.activeElement;
            const overlay = document.createElement("div");
            overlay.className = "app-dialog-overlay";
            overlay.innerHTML = `
                <section class="app-dialog app-dialog-text-confirm" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
                    <div class="app-dialog-mark" aria-hidden="true">!</div>
                    <h2 id="app-dialog-title"></h2>
                    <p id="app-dialog-message"></p>
                    <label class="app-dialog-input-label" for="app-dialog-confirmation-input"></label>
                    <input id="app-dialog-confirmation-input" class="app-dialog-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">
                    <p id="app-dialog-confirmation-hint" class="app-dialog-validation" aria-live="polite"></p>
                    <div class="app-dialog-actions">
                        <button type="button" class="app-dialog-cancel"></button>
                        <button type="button" class="app-dialog-confirm"></button>
                    </div>
                </section>`;

            overlay.querySelector("#app-dialog-title").textContent = title;
            overlay.querySelector("#app-dialog-message").textContent = String(message ?? "");
            overlay.querySelector(".app-dialog-input-label").textContent = inputLabel;
            const input = overlay.querySelector("#app-dialog-confirmation-input");
            input.placeholder = placeholder;
            const hint = overlay.querySelector("#app-dialog-confirmation-hint");
            const cancelButton = overlay.querySelector(".app-dialog-cancel");
            const confirmButton = overlay.querySelector(".app-dialog-confirm");
            cancelButton.textContent = cancelText;
            confirmButton.textContent = confirmText;
            if (danger) confirmButton.classList.add("is-danger");
            confirmButton.disabled = true;

            const updateValidity = () => {
                const valid = input.value.trim() === expectedText;
                confirmButton.disabled = !valid;
                hint.textContent = input.value && !valid
                    ? `Enter ${expectedText} exactly to enable confirmation.`
                    : `This action cannot be undone.`;
            };
            input.addEventListener("input", updateValidity);

            const finish = () => {
                if (input.value.trim() !== expectedText) {
                    updateValidity();
                    input.focus();
                    return;
                }
                closeDialog(input.value.trim());
            };

            cancelButton.addEventListener("click", () => closeDialog(null));
            confirmButton.addEventListener("click", finish);
            overlay.addEventListener("click", event => {
                if (event.target === overlay) closeDialog(null);
            });

            const onKeydown = event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeDialog(null);
                } else if (event.key === "Enter") {
                    event.preventDefault();
                    finish();
                } else if (event.key === "Tab") {
                    const controls = [...overlay.querySelectorAll("input, button:not(:disabled)")];
                    if (!controls.length) return;
                    const first = controls[0];
                    const last = controls[controls.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault(); last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault(); first.focus();
                    }
                }
            };

            activeDialog = { overlay, resolve, previousFocus, onKeydown };
            document.body.appendChild(overlay);
            document.addEventListener("keydown", onKeydown);
            updateValidity();
            input.focus();
        });
    }

    window.showAppDialog = (message, options = {}) => openDialog(message, options);
    window.showAppConfirm = (message, options = {}) => openDialog(message, {
        title: "Please Confirm",
        confirmText: "Confirm",
        cancelText: "Cancel",
        confirm: true,
        ...options
    });
    window.showAppTextConfirm = (message, options = {}) => openTextConfirm(message, options);
})();
