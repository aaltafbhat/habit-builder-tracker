// ==========================================
// DAILY TASK TRACKER
// Version 0.3
// ==========================================

let taskItems = [];
let activeTaskFilter = "all";
let activeTaskSearch = ""; 

async function initializeTasks() {

    const form = document.getElementById("task-form");

    if (!form) {
        throw new Error("Task form not found.");
    }

    form.addEventListener("submit", handleTaskSubmit);

    document.getElementById("cancel-edit-btn")
        .addEventListener("click", resetTaskForm);

    const search = document.getElementById("task-search");
    search?.addEventListener("input", () => {
        activeTaskSearch = search.value.trim().toLowerCase();
        renderTasks();
    });

    const filters = document.getElementById("task-filters");
    filters?.addEventListener("click", event => {
        const button = event.target.closest("[data-filter]");
        if (!button || !filters.contains(button)) return;
        activeTaskFilter = button.dataset.filter || "all";
        filters.querySelectorAll("[data-filter]").forEach(item => {
            const active = item === button;
            item.classList.toggle("active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        renderTasks();
    });

    const scheduleDate = document.getElementById("selected-date");
    if (scheduleDate) {
        scheduleDate.value = getLocalDate();
        scheduleDate.addEventListener("change", renderDailySchedule);
    }
    document.getElementById("previous-date")?.addEventListener("click", () => shiftScheduleDate(-1));
    document.getElementById("next-date")?.addEventListener("click", () => shiftScheduleDate(1));
    document.getElementById("today-date-btn")?.addEventListener("click", () => {
        if (scheduleDate) scheduleDate.value = getLocalDate();
        renderDailySchedule();
    });

    if (!document.getElementById("schedule-task-list")) {
        const output = document.createElement("div");
        output.id = "schedule-task-list";
        output.className = "schedule-task-list";
        output.setAttribute("aria-live", "polite");
        document.querySelector(".date-card")?.appendChild(output);
    }

    document.getElementById("task-date").value = getLocalDate();

    await loadTasks();
}


// Local date without UTC conversion
function getLocalDate() {

    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// Load tasks from IndexedDB
async function loadTasks() {

    taskItems = await getAllTasks();

    renderTasks();
    updateTaskStats();
    renderOverdueTasks();
    renderDailySchedule();

    if (typeof reportCurrentMetrics !== "undefined" &&
        reportCurrentMetrics !== null &&
        typeof refreshReports === "function") {
        await refreshReports();
    }
}


// Add or update task
async function handleTaskSubmit(event) {

    event.preventDefault();

    const id = document.getElementById("task-id").value;

    const title = document.getElementById("task-title")
        .value.trim();

    const date = document.getElementById("task-date").value;

    const priority = document.getElementById("task-priority").value;

    if (!title || !date) {
        showAppDialog("Please complete all task fields.");
        return;
    }

    const existingTask = taskItems.find(
        task => task.id === Number(id)
    );

    const task = {
        title,
        date,
        priority,
        completed: existingTask
            ? existingTask.completed
            : false,
        completedAt: existingTask
            ? (existingTask.completedAt || null)
            : null,
        createdAt: existingTask
            ? existingTask.createdAt
            : new Date().toISOString(),
        ...(id ? { id: Number(id) } : {})
    };

    try {

        await saveTask(task);

        resetTaskForm();

        await loadTasks();

    } catch (error) {

        console.error("Task save failed:", error);
        showAppDialog("Unable to save task.");

    }
}


// Display tasks using the active search and filter.
function renderTasks() {
    const container = document.getElementById("task-list");
    if (!container) return;
    container.replaceChildren();

    const today = getLocalDate();
    const visibleTasks = taskItems.filter(task => {
        const haystack = `${task.title || ""} ${task.priority || ""} ${task.date || ""}`.toLowerCase();
        const matchesSearch = !activeTaskSearch || haystack.includes(activeTaskSearch);
        let matchesFilter = true;

        switch (activeTaskFilter) {
            case "today": matchesFilter = task.date === today; break;
            case "upcoming": matchesFilter = task.date > today && !task.completed; break;
            case "pending": matchesFilter = !task.completed; break;
            case "completed": matchesFilter = Boolean(task.completed); break;
            default: matchesFilter = true;
        }
        return matchesSearch && matchesFilter;
    });

    const title = document.getElementById("task-list-title");
    const subtitle = document.getElementById("task-list-subtitle");
    const labels = {
        all: ["All Tasks", "Your complete task list."],
        today: ["Today's Tasks", "Tasks due today."],
        upcoming: ["Upcoming Tasks", "Future tasks that are not completed."],
        pending: ["Pending Tasks", "Tasks that are still open."],
        completed: ["Completed Tasks", "Tasks you have finished."]
    };
    const heading = labels[activeTaskFilter] || labels.all;
    if (title) title.textContent = heading[0];
    if (subtitle) subtitle.textContent = activeTaskSearch
        ? `${heading[1]} Search: "${activeTaskSearch}"`
        : heading[1];

    if (!visibleTasks.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = taskItems.length
            ? "No tasks match your search or selected filter."
            : "No tasks yet. Add your first task!";
        container.appendChild(empty);
        return;
    }

    [...visibleTasks].sort((a, b) =>
        (a.date || "").localeCompare(b.date || "") || a.id - b.id
    ).forEach(task => {
        const card = document.createElement("div");
        card.className = "task-item";
        if (task.completed) card.classList.add("task-completed");

        const details = document.createElement("div");
        details.className = "task-details";
        const titleNode = document.createElement("h4");
        titleNode.textContent = task.title;
        const meta = document.createElement("p");
        meta.appendChild(
            document.createTextNode(`Due: ${task.date} | Priority: `)
        );

        const priority = document.createElement("span");
        const priorityValue = String(task.priority || "Medium");
        const priorityKey = priorityValue.toLowerCase();
        const safePriority = ["high", "medium", "low"].includes(priorityKey)
            ? priorityKey
            : "medium";

        priority.className = `priority-badge priority-${safePriority}`;
        priority.textContent = priorityValue;
        meta.appendChild(priority);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(task.completed);
        checkbox.setAttribute("aria-label", "Complete task");
        checkbox.addEventListener("change", async () => {
            try {
                task.completed = checkbox.checked;
                task.completedAt = checkbox.checked ? new Date().toISOString() : null;
                await saveTask(task);
                await loadTasks();
            } catch (error) {
                console.error("Task completion update failed:", error);
                showAppDialog("Unable to update task status.");
            }
        });

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => editTask(task.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", async () => {
            if (!(await showAppConfirm("Delete this task? This action cannot be undone.", { danger: true, confirmText: "Delete" }))) return;
            try {
                await deleteTask(task.id);
                await loadTasks();
            } catch (error) {
                console.error("Task deletion failed:", error);
                showAppDialog("Unable to delete task.");
            }
        });

        details.append(titleNode, meta);
        const actions = document.createElement("div");
        actions.className = "task-item-actions";
        actions.append(checkbox, editButton, deleteButton);
        card.append(details, actions);
        container.appendChild(card);
    });
}

// Render overdue tasks independently from the selected task filter.
function renderOverdueTasks() {
    const container = document.getElementById("overdue-list");
    const count = document.getElementById("overdue-count");
    if (!container) return;
    const overdue = taskItems.filter(task =>
        !task.completed && task.date < getLocalDate()
    );
    container.replaceChildren();
    if (count) count.textContent = overdue.length;
    if (!overdue.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No overdue tasks.";
        container.appendChild(empty);
        return;
    }
    overdue.sort((a, b) => a.date.localeCompare(b.date)).forEach(task => {
        const row = document.createElement("div");
        row.className = "overdue-task-item";
        const label = document.createElement("span");
        label.textContent = `${task.title} — Due: ${task.date}`;
        const complete = document.createElement("button");
        complete.type = "button";
        complete.textContent = "Complete";
        complete.addEventListener("click", async () => {
            try {
                task.completed = true;
                task.completedAt = new Date().toISOString();
                await saveTask(task);
                await loadTasks();
            } catch (error) {
                console.error("Overdue task update failed:", error);
                showAppDialog("Unable to update overdue task.");
            }
        });
        row.append(label, complete);
        container.appendChild(row);
    });
}

// Shift the Daily Schedule date.
function shiftScheduleDate(offset) {
    const input = document.getElementById("selected-date");
    if (!input) return;
    const date = new Date(`${input.value || getLocalDate()}T12:00:00`);
    date.setDate(date.getDate() + offset);
    input.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    renderDailySchedule();
}

// Show tasks due on the selected Daily Schedule date.
function renderDailySchedule() {
    const input = document.getElementById("selected-date");
    const container = document.getElementById("schedule-task-list");
    if (!input || !container) return;
    const selected = input.value || getLocalDate();
    const matching = taskItems.filter(task => task.date === selected);
    container.replaceChildren();

    const summary = document.createElement("p");
    summary.className = "schedule-date-summary";
    summary.textContent = `${matching.length} task${matching.length === 1 ? "" : "s"} on ${selected}`;
    container.appendChild(summary);

    if (!matching.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No tasks scheduled for this date.";
        container.appendChild(empty);
        return;
    }
    matching.forEach(task => {
        const row = document.createElement("div");
        row.className = "schedule-task-row";
        const name = document.createElement("span");
        name.textContent = task.title;
        const status = document.createElement("span");
        status.textContent = task.completed ? "Completed" : "Pending";
        row.append(name, status);
        container.appendChild(row);
    });
}


// Edit task
function editTask(id) {

    const task = taskItems.find(
        item => item.id === Number(id)
    );

    if (!task) return;

    document.getElementById("task-id").value = task.id;
    document.getElementById("task-title").value = task.title;
    document.getElementById("task-date").value = task.date;
    document.getElementById("task-priority").value = task.priority;

    document.getElementById("form-heading").textContent =
        "Edit Task";

    document.getElementById("save-task-btn").textContent =
        "Update Task";

    document.getElementById("cancel-edit-btn").hidden = false;

    document.getElementById("task-title").focus();
}


// Reset task form
function resetTaskForm() {

    document.getElementById("task-form").reset();

    document.getElementById("task-id").value = "";

    document.getElementById("task-date").value =
        getLocalDate();

    document.getElementById("form-heading").textContent =
        "Add New Task";

    document.getElementById("save-task-btn").textContent =
        "Add Task";

    document.getElementById("cancel-edit-btn").hidden = true;
}


// Update task statistics
function updateTaskStats() {

    const total = taskItems.length;

    const completed = taskItems.filter(
        task => task.completed
    ).length;

    const pending = total - completed;

    const rate = total
        ? Math.round((completed / total) * 100)
        : 0;

    document.getElementById("total-tasks").textContent = total;

    document.getElementById("completed-tasks").textContent =
        completed;

    document.getElementById("pending-tasks").textContent =
        pending;

    document.getElementById("completion-rate").textContent =
        rate + "%";
}
