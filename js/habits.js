// ==========================================
// 90-DAY COMMAND CENTER — HABIT TRACKER
// Date-specific habit completion and weekly history.
// ==========================================

let habitsCache = [];
let selectedHabitDateKey = getLocalDate();

async function initializeHabits() {
    const form = document.getElementById("habit-form");
    const list = document.getElementById("habit-list");
    if (!form || !list) return;

    form.addEventListener("submit", handleHabitFormSubmit);
    document.getElementById("cancel-habit-edit-btn")?.addEventListener("click", resetHabitForm);
    await refreshHabits();
}

async function refreshHabits() {
    try {
        habitsCache = await getAllHabits();
        renderHabits();
    } catch (error) {
        console.error("Unable to load habits:", error);
        const list = document.getElementById("habit-list");
        if (list) list.textContent = "Could not load habits. Please refresh the page.";
    }
}

async function handleHabitFormSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById("habit-name");
    const descriptionInput = document.getElementById("habit-description");
    const idInput = document.getElementById("habit-id");
    const saveButton = document.getElementById("save-habit-btn");
    const name = nameInput.value.trim();

    if (!name) {
        nameInput.focus();
        return;
    }

    const existing = idInput.value
        ? habitsCache.find(habit => Number(habit.id) === Number(idInput.value))
        : null;

    const habit = {
        ...(existing || {}),
        name,
        description: descriptionInput.value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        completions: existing?.completions || {}
    };
    if (idInput.value) habit.id = Number(idInput.value);

    try {
        saveButton.disabled = true;
        saveButton.textContent = idInput.value ? "Saving..." : "Adding...";
        await saveHabit(habit);
        document.getElementById("habit-form").reset();
        resetHabitForm();
        await refreshHabits();
    } catch (error) {
        console.error("Unable to save habit:", error);
        showAppDialog("Could not save this habit. Please try again.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Add Habit";
    }
}

function resetHabitForm() {
    document.getElementById("habit-form")?.reset();
    const idInput = document.getElementById("habit-id");
    if (idInput) idInput.value = "";
    const heading = document.getElementById("habit-form-heading");
    if (heading) heading.textContent = "Add New Habit";
    const saveButton = document.getElementById("save-habit-btn");
    if (saveButton) saveButton.textContent = "Add Habit";
    const cancelButton = document.getElementById("cancel-habit-edit-btn");
    if (cancelButton) cancelButton.hidden = true;
}

function habitDateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
}

function habitDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function habitEligibleOnDate(habit, key) {
    if (!habit.createdAt) return true;
    const created = new Date(habit.createdAt);
    if (Number.isNaN(created.getTime())) return true;
    return habitDateKey(created) <= key;
}

function renderHabits() {
    const today = getLocalDate();
    const total = habitsCache.filter(habit => habitEligibleOnDate(habit, selectedHabitDateKey)).length;
    const completed = habitsCache.filter(habit =>
        habitEligibleOnDate(habit, selectedHabitDateKey) && Boolean(habit.completions?.[selectedHabitDateKey])
    ).length;
    const rate = total ? Math.round((completed / total) * 100) : 0;

    document.getElementById("habit-total-count").textContent = total;
    document.getElementById("habit-completed-count").textContent = completed;
    document.getElementById("habit-completion-rate").textContent = `${rate}%`;

    const selectedDate = habitDateFromKey(selectedHabitDateKey);
    const dateLabel = selectedHabitDateKey === today
        ? `Today · ${selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
        : selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    document.getElementById("habit-today-label").textContent = dateLabel;

    const heading = document.querySelector("#habit-list")?.closest(".habit-panel")?.querySelector("h3");
    if (heading) heading.textContent = selectedHabitDateKey === today ? "Today's Habits" : "Habits for Selected Date";

    const list = document.getElementById("habit-list");
    list.replaceChildren();
    if (!total) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No habits were active on this date.";
        list.appendChild(empty);
    } else {
        habitsCache.filter(habit => habitEligibleOnDate(habit, selectedHabitDateKey))
            .forEach(habit => list.appendChild(createHabitElement(habit, selectedHabitDateKey)));
    }

    renderHabitWeek();
}

function createHabitElement(habit, dateKey) {
    const completed = Boolean(habit.completions?.[dateKey]);
    const item = document.createElement("div");
    item.className = `habit-item${completed ? " completed" : ""}`;

    const main = document.createElement("div");
    main.className = "habit-item-main";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "habit-check";
    checkbox.checked = completed;
    checkbox.setAttribute("aria-label", `Mark ${habit.name} ${completed ? "incomplete" : "complete"} for ${dateKey}`);
    checkbox.addEventListener("change", () => toggleHabitCompletion(habit.id, checkbox.checked, dateKey));

    const details = document.createElement("div");
    details.className = "habit-item-details";
    const title = document.createElement("h4");
    title.textContent = habit.name;
    details.appendChild(title);
    if (habit.description) {
        const description = document.createElement("p");
        description.textContent = habit.description;
        details.appendChild(description);
    }
    main.append(checkbox, details);

    const actions = document.createElement("div");
    actions.className = "habit-item-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => editHabit(habit.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => removeHabit(habit.id));
    actions.append(editButton, deleteButton);
    item.append(main, actions);
    return item;
}

async function toggleHabitCompletion(id, checked, dateKey = selectedHabitDateKey) {
    const habit = habitsCache.find(item => Number(item.id) === Number(id));
    if (!habit) return;
    habit.completions = habit.completions || {};
    if (checked) habit.completions[dateKey] = true;
    else delete habit.completions[dateKey];

    try {
        await saveHabit(habit);
        await refreshHabits();
        if (typeof refreshOverviewDashboard === "function") await refreshOverviewDashboard();
        if (typeof refreshReports === "function") await refreshReports();
    } catch (error) {
        console.error("Unable to update habit:", error);
        showAppDialog("Could not update this habit. Please try again.");
    }
}

function editHabit(id) {
    const habit = habitsCache.find(item => Number(item.id) === Number(id));
    if (!habit) return;
    document.getElementById("habit-id").value = habit.id;
    document.getElementById("habit-name").value = habit.name;
    document.getElementById("habit-description").value = habit.description || "";
    document.getElementById("habit-form-heading").textContent = "Edit Habit";
    document.getElementById("save-habit-btn").textContent = "Save Changes";
    document.getElementById("cancel-habit-edit-btn").hidden = false;
    document.getElementById("habit-name").focus();
}

async function removeHabit(id) {
    const habit = habitsCache.find(item => Number(item.id) === Number(id));
    if (!habit || !await showAppConfirm(`Delete the habit "${habit.name}" and its completion history?`, { danger: true, confirmText: "Delete" })) return;
    try {
        await deleteHabit(id);
        await refreshHabits();
    } catch (error) {
        console.error("Unable to delete habit:", error);
        showAppDialog("Could not delete this habit. Please try again.");
    }
}

function renderHabitWeek() {
    const container = document.getElementById("habit-weekly-summary");
    container.replaceChildren();
    if (!habitsCache.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Your weekly consistency will appear here.";
        container.appendChild(empty);
        return;
    }

    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const key = habitDateKey(date);
        const eligible = habitsCache.filter(habit => habitEligibleOnDate(habit, key));
        const count = eligible.filter(habit => Boolean(habit.completions?.[key])).length;
        const percentage = eligible.length ? Math.round((count / eligible.length) * 100) : 0;

        const day = document.createElement("button");
        day.type = "button";
        day.className = `habit-week-day${key === selectedHabitDateKey ? " is-selected" : ""}`;
        day.setAttribute("aria-pressed", String(key === selectedHabitDateKey));
        day.setAttribute("aria-label", `Select ${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}: ${percentage}% complete`);
        day.addEventListener("click", () => {
            selectedHabitDateKey = key;
            renderHabits();
        });

        const label = document.createElement("span");
        label.className = "habit-week-day-label";
        label.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
        const value = document.createElement("span");
        value.className = "habit-week-day-value";
        value.textContent = `${percentage}%`;
        const bar = document.createElement("div");
        bar.className = "habit-week-day-bar";
        const fill = document.createElement("div");
        fill.className = "habit-week-day-fill";
        fill.style.height = `${percentage}%`;
        bar.appendChild(fill);
        day.append(label, value, bar);
        container.appendChild(day);
    }
}
