// ==========================================
// 90-DAY COMMAND CENTER
// PROJECT TRACKER — VERSION 0.8
// ==========================================

let allProjects = [];
let activeProjectFilter = "all";

function projectTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function projectIsOverdue(project) {
    return project.status !== "completed" &&
        Boolean(project.deadline) &&
        project.deadline < projectTodayKey();
}

function projectStatusLabel(status) {
    const labels = {
        "not-started": "Not Started",
        "in-progress": "In Progress",
        "on-hold": "On Hold",
        "completed": "Completed"
    };
    return labels[status] || "Not Started";
}

function projectElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

async function initializeProjects() {
    const form = document.getElementById("project-form");
    const list = document.getElementById("project-list");
    const filters = document.getElementById("project-filters");
    const progress = document.getElementById("project-progress");
    const progressValue = document.getElementById("project-progress-value");
    const status = document.getElementById("project-status");
    const cancel = document.getElementById("cancel-project-edit-btn");

    if (!form || !list || !filters) {
        console.warn("Project Tracker UI elements were not found.");
        return;
    }

    form.addEventListener("submit", handleProjectSubmit);
    filters.addEventListener("click", handleProjectFilter);
    progress.addEventListener("input", () => {
        progressValue.textContent = `${progress.value}%`;
    });
    status.addEventListener("change", () => {
        if (status.value === "completed") {
            progress.value = "100";
        } else if (status.value === "not-started") {
            progress.value = "0";
        } else if (Number(progress.value) === 0 || Number(progress.value) === 100) {
            progress.value = "5";
        }
        progressValue.textContent = `${progress.value}%`;
    });
    cancel.addEventListener("click", resetProjectForm);

    await loadProjects();
}

async function loadProjects() {
    allProjects = await getAllProjects();
    renderProjectSummary();
    renderProjectList();
}

function renderProjectSummary() {
    const total = allProjects.length;
    const active = allProjects.filter(p => p.status === "in-progress").length;
    const completed = allProjects.filter(p => p.status === "completed").length;
    const overdue = allProjects.filter(projectIsOverdue).length;

    document.getElementById("project-total-count").textContent = total;
    document.getElementById("project-active-count").textContent = active;
    document.getElementById("project-completed-count").textContent = completed;
    document.getElementById("project-overdue-count").textContent = overdue;
}

function renderProjectList() {
    const list = document.getElementById("project-list");
    const count = document.getElementById("project-list-count");
    const filtered = activeProjectFilter === "all"
        ? allProjects
        : allProjects.filter(project => project.status === activeProjectFilter);

    count.textContent = `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}`;
    list.replaceChildren();

    if (filtered.length === 0) {
        const empty = projectElement("div", "empty-state");
        empty.append(
            projectElement("span", "", "▣"),
            projectElement("p", "", allProjects.length === 0
                ? "No projects yet. Add your first project."
                : "No projects match this filter.")
        );
        list.append(empty);
        return;
    }

    filtered.sort((a, b) => {
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        return (a.deadline || "").localeCompare(b.deadline || "");
    });

    filtered.forEach(project => {
        const item = projectElement("article", "project-item");
        const header = projectElement("div", "project-item-header");
        const details = projectElement("div", "project-details");
        details.append(projectElement("h4", "", project.title));
        if (project.description) {
            details.append(projectElement("p", "", project.description));
        }

        const badge = projectElement(
            "span",
            `project-status ${project.status}`,
            projectIsOverdue(project) ? "Overdue" : projectStatusLabel(project.status)
        );
        header.append(details, badge);
        item.append(header);

        const dates = projectElement("p", "project-date-line",
            `Start: ${project.startDate}  ·  Deadline: ${project.deadline}`);
        item.append(dates);

        const progressHeading = projectElement("div", "project-progress-heading");
        progressHeading.append(
            projectElement("span", "", "Progress"),
            projectElement("strong", "", `${Number(project.progress) || 0}%`)
        );
        item.append(progressHeading);

        const track = projectElement("div", "project-progress-track");
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(Number(project.progress) || 0));
        track.setAttribute("aria-label", `${project.title} progress`);
        const fill = projectElement("div", "project-progress-fill");
        fill.style.width = `${Math.max(0, Math.min(100, Number(project.progress) || 0))}%`;
        track.append(fill);
        item.append(track);

        const actions = projectElement("div", "project-item-actions");
        const edit = projectElement("button", "", "Edit");
        edit.type = "button";
        edit.addEventListener("click", () => editProject(project.id));
        const remove = projectElement("button", "", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => removeProject(project.id));
        actions.append(edit, remove);
        item.append(actions);
        list.append(item);
    });
}

function handleProjectFilter(event) {
    const button = event.target.closest("[data-project-filter]");
    if (!button) return;

    activeProjectFilter = button.dataset.projectFilter;
    document.querySelectorAll("[data-project-filter]").forEach(filter => {
        const active = filter === button;
        filter.classList.toggle("active", active);
        filter.setAttribute("aria-pressed", String(active));
    });
    renderProjectList();
}

async function handleProjectSubmit(event) {
    event.preventDefault();

    const idValue = document.getElementById("project-id").value;
    const title = document.getElementById("project-title").value.trim();
    const description = document.getElementById("project-description").value.trim();
    const startDate = document.getElementById("project-start-date").value;
    const deadline = document.getElementById("project-deadline").value;
    const status = document.getElementById("project-status").value;
    let progress = Number(document.getElementById("project-progress").value);

    if (!title || !startDate || !deadline) {
        showAppDialog("Please complete the project name, start date and deadline.");
        return;
    }
    if (deadline < startDate) {
        showAppDialog("The deadline cannot be earlier than the start date.");
        return;
    }

    if (status === "completed") progress = 100;
    if (status === "not-started") progress = 0;
    if (status === "in-progress" && (progress === 0 || progress === 100)) {
        progress = progress === 100 ? 95 : 5;
    }

    const existing = idValue
        ? allProjects.find(project => project.id === Number(idValue))
        : null;

    const project = {
        ...(existing || {}),
        title,
        description,
        startDate,
        deadline,
        status,
        progress,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    if (idValue) project.id = Number(idValue);

    try {
        await saveProject(project);
        resetProjectForm();
        await loadProjects();
    } catch (error) {
        console.error("Could not save project:", error);
        showAppDialog("The project could not be saved. Please try again.");
    }
}

function editProject(id) {
    const project = allProjects.find(item => item.id === Number(id));
    if (!project) return;

    document.getElementById("project-id").value = project.id;
    document.getElementById("project-title").value = project.title || "";
    document.getElementById("project-description").value = project.description || "";
    document.getElementById("project-start-date").value = project.startDate || "";
    document.getElementById("project-deadline").value = project.deadline || "";
    document.getElementById("project-status").value = project.status || "not-started";
    document.getElementById("project-progress").value = Number(project.progress) || 0;
    document.getElementById("project-progress-value").textContent = `${Number(project.progress) || 0}%`;
    document.getElementById("project-form-heading").textContent = "Edit Project";
    document.getElementById("save-project-btn").textContent = "Save Changes";
    document.getElementById("cancel-project-edit-btn").hidden = false;
    document.getElementById("project-title").focus();
}

function resetProjectForm() {
    const form = document.getElementById("project-form");
    form.reset();
    document.getElementById("project-id").value = "";
    document.getElementById("project-status").value = "not-started";
    document.getElementById("project-progress").value = "0";
    document.getElementById("project-progress-value").textContent = "0%";
    document.getElementById("project-form-heading").textContent = "Add New Project";
    document.getElementById("save-project-btn").textContent = "Add Project";
    document.getElementById("cancel-project-edit-btn").hidden = true;
}

async function removeProject(id) {
    const project = allProjects.find(item => item.id === Number(id));
    if (!project || !await showAppConfirm(`Delete "${project.title}"? This cannot be undone.`, { danger: true, confirmText: "Delete" })) return;

    try {
        await deleteProject(project.id);
        await loadProjects();
        if (document.getElementById("project-id").value === String(project.id)) {
            resetProjectForm();
        }
    } catch (error) {
        console.error("Could not delete project:", error);
        showAppDialog("The project could not be deleted. Please try again.");
    }
}
