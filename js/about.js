/* Habit Builder Tracker v1.5.20 — About & Contact interactions */
(() => {
    "use strict";

    const byId = id => document.getElementById(id);
    const contactText = [
        "Altaf Bhat (Aashu Bhatt)",
        "GST Infusion",
        "Phone: +91 9796999905",
        "Business email: gstinfusion@gmail.com",
        "Personal email: aaltafbhat@gmail.com",
        "Author and creator of Habit Builder Tracker"
    ].join("\n");

    function bindAboutContact() {
        const copyButton = byId("about-copy-contact");
        const copyStatus = byId("about-copy-status");
        if (copyButton && copyButton.dataset.bound !== "true") {
            copyButton.dataset.bound = "true";
            copyButton.addEventListener("click", async () => {
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(contactText);
                    } else {
                        const area = document.createElement("textarea");
                        area.value = contactText;
                        area.setAttribute("readonly", "");
                        area.style.position = "fixed";
                        area.style.opacity = "0";
                        document.body.appendChild(area);
                        area.select();
                        const copied = document.execCommand("copy");
                        area.remove();
                        if (!copied) throw new Error("Clipboard access is unavailable.");
                    }
                    if (copyStatus) copyStatus.textContent = "Contact details copied.";
                    copyButton.textContent = "Copied";
                    window.setTimeout(() => { copyButton.textContent = "Copy contact details"; }, 1800);
                } catch (error) {
                    console.warn("Could not copy contact details:", error);
                    if (copyStatus) copyStatus.textContent = "Copy was unavailable. Use the email, phone or Save contact links instead.";
                }
            });
        }

        const dialog = byId("about-qr-dialog");
        const open = byId("about-qr-open");
        const close = byId("about-qr-close");
        if (dialog && open && open.dataset.bound !== "true") {
            open.dataset.bound = "true";
            open.addEventListener("click", () => {
                if (typeof dialog.showModal === "function") dialog.showModal();
                else dialog.setAttribute("open", "");
            });
        }
        if (dialog && close && close.dataset.bound !== "true") {
            close.dataset.bound = "true";
            close.addEventListener("click", () => {
                if (typeof dialog.close === "function") dialog.close();
                else dialog.removeAttribute("open");
            });
        }
        if (dialog && dialog.dataset.backdropBound !== "true") {
            dialog.dataset.backdropBound = "true";
            dialog.addEventListener("click", event => {
                if (event.target === dialog && typeof dialog.close === "function") dialog.close();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindAboutContact, { once: true });
    } else {
        bindAboutContact();
    }
})();
