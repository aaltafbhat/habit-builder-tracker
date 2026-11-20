/* ==========================================
   HABIT BUILDER TRACKER
   NAVIGATION MODULE
   Version 0.4
========================================== */

function initializeNavigation() {

    const navLinks = document.querySelectorAll(
        '.sidebar a[href^="#"]'
    );

    const pages = document.querySelectorAll(
        ".page-section"
    );

    const sidebar = document.querySelector(".sidebar");

    const overlay = document.getElementById(
        "sidebar-overlay"
    );

    const menuButton = document.getElementById(
        "mobile-menu-btn"
    );


    // ======================================
    // SHOW SELECTED PAGE
    // ======================================

    function showPage(pageId) {

        const targetPage = document.getElementById(pageId);

        if (
            !targetPage ||
            !targetPage.classList.contains("page-section")
        ) {
            return;
        }

        pages.forEach(page => {
            page.classList.remove("active");
            page.hidden = true;
        });

        targetPage.hidden = false;
        targetPage.classList.add("active");

        if (
            pageId === "overview" &&
            typeof refreshOverviewDashboard === "function"
        ) {
            refreshOverviewDashboard();
        }

        navLinks.forEach(link => {

            const isActive =
                link.getAttribute("href") === "#" + pageId;

            link.classList.toggle("active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }

        });

    }


    // ======================================
    // CLOSE MOBILE NAVIGATION
    // ======================================

    function closeMobileNavigation() {

        if (!sidebar || !overlay || !menuButton) {
            return;
        }

        sidebar.classList.remove("mobile-open");
        overlay.classList.remove("visible");

        document.body.classList.remove(
            "mobile-nav-open"
        );

        menuButton.setAttribute(
            "aria-expanded",
            "false"
        );

        menuButton.setAttribute(
            "aria-label",
            "Open navigation"
        );

    }


    // ======================================
    // OPEN MOBILE NAVIGATION
    // ======================================

    function openMobileNavigation() {

        if (!sidebar || !overlay || !menuButton) {
            return;
        }

        sidebar.classList.add("mobile-open");
        overlay.classList.add("visible");

        document.body.classList.add(
            "mobile-nav-open"
        );

        menuButton.setAttribute(
            "aria-expanded",
            "true"
        );

        menuButton.setAttribute(
            "aria-label",
            "Close navigation"
        );

    }


    // ======================================
    // MOBILE MENU BUTTON
    // ======================================

    if (
        menuButton &&
        menuButton.dataset.mobileBound !== "true"
    ) {

        menuButton.dataset.mobileBound = "true";

        menuButton.addEventListener("click", () => {

            const isOpen =
                sidebar &&
                sidebar.classList.contains("mobile-open");

            if (isOpen) {
                closeMobileNavigation();
            } else {
                openMobileNavigation();
            }

        });

    }


    // ======================================
    // OVERLAY CLICK
    // ======================================

    if (
        overlay &&
        overlay.dataset.overlayBound !== "true"
    ) {

        overlay.dataset.overlayBound = "true";

        overlay.addEventListener(
            "click",
            closeMobileNavigation
        );

    }


    // ======================================
    // SIDEBAR LINKS
    // ======================================

    navLinks.forEach(link => {

        if (link.dataset.navigationBound === "true") {
            return;
        }

        link.dataset.navigationBound = "true";

        link.addEventListener("click", function(event) {

            const pageId = this
                .getAttribute("href")
                .substring(1);

            const targetPage =
                document.getElementById(pageId);

            if (
                !targetPage ||
                !targetPage.classList.contains("page-section")
            ) {
                return;
            }

            event.preventDefault();

            if (location.hash !== "#" + pageId) {

                history.pushState(
                    null,
                    "",
                    "#" + pageId
                );

            }

            showPage(pageId);

            closeMobileNavigation();

        });

    });


    // ======================================
    // BROWSER BACK / FORWARD
    // ======================================

    if (!window.navigationHistoryBound) {

        window.navigationHistoryBound = true;

        window.addEventListener("popstate", () => {

            const pageId =
                location.hash.substring(1) || "overview";

            const targetPage =
                document.getElementById(pageId);

            showPage(
                targetPage &&
                targetPage.classList.contains("page-section")
                    ? pageId
                    : "overview"
            );

            closeMobileNavigation();

        });

    }


    // ======================================
    // HASH CHANGES
    // Dashboard shortcuts and page anchors
    // ======================================

    if (!window.navigationHashChangeBound) {

        window.navigationHashChangeBound = true;

        window.addEventListener("hashchange", () => {

            const pageId =
                location.hash.substring(1) || "overview";

            const targetPage =
                document.getElementById(pageId);

            showPage(
                targetPage &&
                targetPage.classList.contains("page-section")
                    ? pageId
                    : "overview"
            );

            closeMobileNavigation();

        });

    }


    // ======================================
    // ESCAPE KEY
    // ======================================

    if (!window.navigationEscapeBound) {

        window.navigationEscapeBound = true;

        document.addEventListener("keydown", event => {

            if (event.key === "Escape") {
                closeMobileNavigation();
            }

        });

    }


    // ======================================
    // INITIAL PAGE
    // ======================================

    const requestedPage =
        location.hash.substring(1) || "overview";

    const initialPage =
        document.getElementById(requestedPage);

    showPage(
        initialPage &&
        initialPage.classList.contains("page-section")
            ? requestedPage
            : "overview"
    );


    closeMobileNavigation();

    console.log(
        "Navigation initialized successfully."
    );

}


// ==========================================
// END NAVIGATION MODULE
// ==========================================