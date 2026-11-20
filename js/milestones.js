// ==========================================
// 90-DAY COMMAND CENTER
// MILESTONE TRACKER — VERSION 0.7
// ==========================================

let milestoneFilter = "all";

function milestoneLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function milestoneEscapeClass(status) {
    return ({
        "not-started": "not-started",
        "in-progress": "in-progress",
        "completed": "completed"
    })[status] || "not-started";
}

async function initializeMilestones() {
    const form = document.getElementById("milestone-form");
    const list = document.getElementById("milestone-list");
    if (!form || !list) {
        console.warn("Milestone interface not found; skipping initialization.");
        return;
    }

    form.addEventListener("submit", handleMilestoneSubmit);

    document.getElementById("milestone-progress")?.addEventListener("input", (event) => {
        const output = document.getElementById("milestone-progress-value");
        if (output) output.textContent = `${event.target.value}%`;
    });

    document.getElementById("cancel-milestone-edit-btn")?.addEventListener("click", resetMilestoneForm);

    document.getElementById("milestone-filters")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-milestone-filter]");
        if (!button) return;
        milestoneFilter = button.dataset.milestoneFilter;
        document.querySelectorAll("[data-milestone-filter]").forEach((item) => {
            item.classList.toggle("active", item === button);
            item.setAttribute("aria-pressed", item === button ? "true" : "false");
        });
        await renderMilestones();
    });

    list.addEventListener("click", handleMilestoneListAction);
    await renderMilestones();
}

async function handleMilestoneSubmit(event) {
    event.preventDefault();

    const idValue = document.getElementById("milestone-id").value;
    const title = document.getElementById("milestone-title").value.trim();
    const description = document.getElementById("milestone-description").value.trim();
    const targetDate = document.getElementById("milestone-target-date").value;
    let status = document.getElementById("milestone-status").value;
    let progress = Number(document.getElementById("milestone-progress").value);

    if (!title) {
        showAppDialog("Please enter a milestone title.");
        document.getElementById("milestone-title").focus();
        return;
    }

    if (status === "completed") progress = 100;
    if (status === "not-started") progress = 0;
    if (status === "in-progress") progress = Math.min(99, Math.max(1, progress));

    const existing = idValue
        ? (await getAllMilestones()).find((item) => Number(item.id) === Number(idValue))
        : null;

    const milestone = {
        ...(existing || {}),
        ...(idValue ? { id: Number(idValue) } : {}),
        title,
        description,
        targetDate,
        status,
        progress,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        await saveMilestone(milestone);
        resetMilestoneForm();
        await renderMilestones();
    } catch (error) {
        console.error("Unable to save milestone:", error);
        showAppDialog("Milestone could not be saved. Please try again.");
    }
}

async function handleMilestoneListAction(event) {
    const button = event.target.closest("[data-milestone-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.milestoneAction;

    if (action === "edit") {
        const milestone = (await getAllMilestones()).find((item) => Number(item.id) === id);
        if (!milestone) return;

        document.getElementById("milestone-id").value = milestone.id;
        document.getElementById("milestone-title").value = milestone.title || "";
        document.getElementById("milestone-description").value = milestone.description || "";
        document.getElementById("milestone-target-date").value = milestone.targetDate || "";
        document.getElementById("milestone-status").value = milestone.status || "not-started";
        document.getElementById("milestone-progress").value = milestone.progress ?? 0;
        document.getElementById("milestone-progress-value").textContent = `${milestone.progress ?? 0}%`;
        document.getElementById("milestone-form-heading").textContent = "Edit Milestone";
        document.getElementById("save-milestone-btn").textContent = "Save Changes";
        document.getElementById("cancel-milestone-edit-btn").hidden = false;
        document.getElementById("milestone-title").focus();
        return;
    }

    if (action === "delete") {
        const confirmed = await showAppConfirm("Delete this milestone? This action cannot be undone.", { danger: true, confirmText: "Delete" });
        if (!confirmed) return;
        try {
            await deleteMilestone(id);
            await renderMilestones();
        } catch (error) {
            console.error("Unable to delete milestone:", error);
            showAppDialog("Milestone could not be deleted. Please try again.");
        }
    }
}

function resetMilestoneForm() {
    const form = document.getElementById("milestone-form");
    if (!form) return;
    form.reset();
    document.getElementById("milestone-id").value = "";
    document.getElementById("milestone-progress").value = 0;
    document.getElementById("milestone-progress-value").textContent = "0%";
    document.getElementById("milestone-form-heading").textContent = "Add New Milestone";
    document.getElementById("save-milestone-btn").textContent = "Add Milestone";
    document.getElementById("cancel-milestone-edit-btn").hidden = true;
}

async function renderMilestones() {
    const milestones = await getAllMilestones();
    const today = milestoneLocalDate();

    const completed = milestones.filter((item) => item.status === "completed").length;
    const active = milestones.filter((item) => item.status === "in-progress").length;
    const overdue = milestones.filter((item) =>
        item.status !== "completed" && item.targetDate && item.targetDate < today
    ).length;

    setMilestoneText("milestone-total-count", milestones.length);
    setMilestoneText("milestone-active-count", active);
    setMilestoneText("milestone-completed-count", completed);
    setMilestoneText("milestone-overdue-count", overdue);

    const visible = milestones
        .filter((item) => milestoneFilter === "all" || item.status === milestoneFilter)
        .sort((a, b) => {
            if (!a.targetDate) return 1;
            if (!b.targetDate) return -1;
            return a.targetDate.localeCompare(b.targetDate);
        });

    setMilestoneText("milestone-list-count", `${visible.length} milestone${visible.length === 1 ? "" : "s"}`);

    const list = document.getElementById("milestone-list");
    list.replaceChildren();

    if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "milestone-empty";
        const flag = document.createElement("div");
        flag.className = "milestone-empty-icon";
        flag.textContent = "⚑";
        const message = document.createElement("p");
        message.textContent = milestones.length
            ? "No milestones match this filter."
            : "No milestones yet. Add your first milestone.";
        empty.append(flag, message);
        list.append(empty);
        return;
    }

    visible.forEach((milestone) => {
        const isOverdue = milestone.status !== "completed" &&
            milestone.targetDate && milestone.targetDate < today;

        const card = document.createElement("article");
        card.className = "milestone-item";

        const top = document.createElement("div");
        top.className = "milestone-item-top";

        const headingWrap = document.createElement("div");
        const heading = document.createElement("h4");
        heading.textContent = milestone.title;
        const description = document.createElement("p");
        description.className = "milestone-item-description";
        description.textContent = milestone.description || "No description provided.";
        headingWrap.append(heading, description);

        const status = document.createElement("span");
        status.className = `milestone-status ${milestoneEscapeClass(milestone.status)}`;
        status.textContent = milestone.status === "in-progress"
            ? "In Progress"
            : milestone.status === "completed" ? "Completed" : "Not Started";
        top.append(headingWrap, status);

        const meta = document.createElement("div");
        meta.className = "milestone-item-meta";
        const date = document.createElement("span");
        date.textContent = milestone.targetDate
            ? `Target: ${milestone.targetDate}`
            : "No target date";
        if (isOverdue) date.textContent += " · Overdue";
        meta.append(date);

        const progressRow = document.createElement("div");
        progressRow.className = "milestone-progress-row";
        const progressLabel = document.createElement("span");
        progressLabel.textContent = "Progress";
        const progressValue = document.createElement("strong");
        progressValue.textContent = `${milestone.progress ?? 0}%`;
        progressRow.append(progressLabel, progressValue);

        const track = document.createElement("div");
        track.className = "milestone-progress-track";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(milestone.progress ?? 0));
        const fill = document.createElement("div");
        fill.className = "milestone-progress-fill";
        fill.style.width = `${Math.max(0, Math.min(100, Number(milestone.progress) || 0))}%`;
        track.append(fill);

        const actions = document.createElement("div");
        actions.className = "milestone-item-actions";
        actions.append(
            createMilestoneAction("Edit", "edit", milestone.id),
            createMilestoneAction("Delete", "delete", milestone.id)
        );

        card.append(top, meta, progressRow, track, actions);
        list.append(card);
    });
}

function createMilestoneAction(label, action, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "milestone-action-btn";
    button.dataset.milestoneAction = action;
    button.dataset.id = id;
    button.textContent = label;
    return button;
}

function setMilestoneText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}
