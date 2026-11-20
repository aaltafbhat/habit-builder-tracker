// ==========================================
// 90-DAY COMMAND CENTER — OVERVIEW DASHBOARD
// Live summaries from existing IndexedDB stores.
// ==========================================

let overviewRefreshInProgress = false;

function overviewTodayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function overviewDateFromTimestamp(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return overviewTodayKey(date);
}

function overviewFormatDate(value) {
    if (!value) return "No date";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function overviewElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function initializeOverviewDashboard() {
    await refreshOverviewDashboard();
}

async function refreshOverviewDashboard() {
    if (overviewRefreshInProgress || !document.getElementById("overview")) return;
    overviewRefreshInProgress = true;
    try {
        const [tasks, habits, milestones, projects] = await Promise.all([
            getAllTasks(), getAllHabits(), getAllMilestones(), getAllProjects()
        ]);
        const today = overviewTodayKey();
        const completedTasks = tasks.filter(task => task.completed);
        const todaysTasks = tasks.filter(task => task.date === today);
        const todaysCompleted = todaysTasks.filter(task => task.completed).length;
        const progress = todaysTasks.length
            ? Math.round(todaysCompleted / todaysTasks.length * 100) : 0;

        overviewSetText("today-progress-label", `${todaysCompleted} of ${todaysTasks.length} tasks`);
        overviewSetText("today-progress-caption", `${progress}% completed today`);
        const progressFill = document.getElementById("today-progress-fill");
        const progressTrack = document.getElementById("today-progress-track");
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(progress));

        const completedDates = new Set(completedTasks
            .map(task => overviewDateFromTimestamp(task.completedAt))
            .filter(Boolean));
        let streak = 0;
        const cursor = new Date();
        while (completedDates.has(overviewTodayKey(cursor))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
        overviewSetText("current-streak", streak);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        const weekCount = completedTasks.filter(task => {
            const date = new Date(task.completedAt);
            return task.completedAt && !Number.isNaN(date.getTime()) && date >= weekStart;
        }).length;
        overviewSetText("weekly-completed-count", weekCount);

        renderOverviewWeeklyChart(completedTasks);
        renderOverviewTodayTasks(todaysTasks);
        renderOverviewPriority(tasks, milestones, projects, today);
        renderOverviewHabits(habits, today);
        renderOverviewPortfolio(milestones, projects, tasks, today);
    } catch (error) {
        console.error("Overview dashboard refresh failed:", error);
        ["weekly-productivity-chart", "overview-today-tasks",
         "overview-priority-focus", "overview-portfolio-summary"].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.textContent = "Unable to load this summary. Please refresh the page.";
        });
    } finally {
        overviewRefreshInProgress = false;
    }
}

function overviewSetText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function renderOverviewWeeklyChart(tasks) {
    const container = document.getElementById("weekly-productivity-chart");
    if (!container) return;
    container.replaceChildren();

    const days = [];
    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = overviewTodayKey(date);
        const count = tasks.filter(task => overviewDateFromTimestamp(task.completedAt) === key).length;
        days.push({
            key,
            count,
            label: date.toLocaleDateString(undefined, { weekday: "short" }),
            dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        });
    }
    const max = Math.max(1, ...days.map(day => day.count));
    const chart = overviewElement("div", "overview-week-bars");
    days.forEach(day => {
        const column = overviewElement("div", "overview-week-column");
        const value = overviewElement("strong", "overview-week-value", day.count);
        const track = overviewElement("div", "overview-week-track");
        const bar = overviewElement("span", "overview-week-bar");
        bar.style.height = `${Math.max(day.count ? 8 : 2, day.count / max * 100)}%`;
        bar.title = `${day.dateLabel}: ${day.count} completed`;
        track.appendChild(bar);
        const label = overviewElement("span", "overview-week-label", day.label);
        const dateLabel = overviewElement("small", "overview-week-date", day.dateLabel);
        column.append(value, track, label, dateLabel);
        chart.appendChild(column);
    });
    container.appendChild(chart);
}

function renderOverviewTodayTasks(tasks) {
    const container = document.getElementById("overview-today-tasks");
    if (!container) return;
    container.replaceChildren();
    overviewSetText("overview-today-summary", `${tasks.filter(t => t.completed).length} of ${tasks.length} completed today`);

    if (!tasks.length) {
        container.appendChild(overviewElement("p", "empty-state", "No tasks scheduled for today."));
        return;
    }

    tasks.slice().sort((a, b) => {
        const order = { High: 0, Medium: 1, Low: 2 };
        return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    }).forEach(task => {
        const row = overviewElement("div", "overview-task-row");
        const info = overviewElement("div", "overview-task-info");
        const title = overviewElement("strong", task.completed ? "is-complete" : "", task.title);
        const meta = overviewElement("small", "", `${task.priority || "Normal"} priority`);
        info.append(title, meta);
        const action = overviewElement("button", "overview-complete-btn", task.completed ? "Done" : "Complete");
        action.type = "button";
        action.disabled = Boolean(task.completed);
        action.setAttribute("aria-label", `${task.completed ? "Completed" : "Mark complete"}: ${task.title}`);
        action.addEventListener("click", async () => {
            try {
                task.completed = true;
                task.completedAt = task.completedAt || new Date().toISOString();
                await saveTask(task);
                await refreshOverviewDashboard();
                if (typeof loadTasks === "function") await loadTasks();
            } catch (error) {
                console.error("Unable to complete dashboard task:", error);
                showAppDialog("Could not update this task. Please try again.");
            }
        });
        row.append(info, action);
        container.appendChild(row);
    });
}

function renderOverviewPriority(tasks, milestones, projects, today) {
    const container = document.getElementById("overview-priority-focus");
    if (!container) return;
    container.replaceChildren();
    const items = [];

    tasks.filter(task => !task.completed && task.date && task.date < today)
        .forEach(task => items.push({ type: "Overdue task", title: task.title, date: task.date, rank: 0, href: "#daily-tracker" }));
    tasks.filter(task => !task.completed && task.date >= today && task.date <= overviewAddDays(today, 7))
        .forEach(task => items.push({ type: `${task.priority || "Normal"} priority task`, title: task.title, date: task.date, rank: task.priority === "High" ? 1 : 3, href: "#daily-tracker" }));
    milestones.filter(item => item.status !== "completed" && item.targetDate)
        .forEach(item => items.push({ type: "Milestone", title: item.title, date: item.targetDate, rank: item.targetDate < today ? 0 : 2, href: "#milestones" }));
    projects.filter(item => item.status !== "completed" && item.deadline)
        .forEach(item => items.push({ type: "Project deadline", title: item.name || item.title, date: item.deadline, rank: item.deadline < today ? 0 : 2, href: "#projects" }));

    items.sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date));
    if (!items.length) {
        container.appendChild(overviewElement("p", "empty-state", "No urgent items. You're clear."));
        return;
    }
    items.slice(0, 4).forEach(item => {
        const row = overviewElement("a", "overview-focus-item");
        row.href = item.href;
        const info = overviewElement("span", "overview-focus-info");
        info.append(overviewElement("strong", "", item.title), overviewElement("small", "", item.type));
        const date = overviewElement("span", item.date < today ? "overview-date-overdue" : "overview-date", item.date < today ? `Overdue · ${overviewFormatDate(item.date)}` : overviewFormatDate(item.date));
        row.append(info, date);
        container.appendChild(row);
    });
}

function renderOverviewHabits(habits, today) {
    const completed = habits.filter(habit => Boolean(habit.completions?.[today])).length;
    const rate = habits.length ? Math.round(completed / habits.length * 100) : 0;
    overviewSetText("overview-habit-rate", `${rate}%`);
    overviewSetText("overview-habit-count", `${completed} of ${habits.length} habits completed`);
    const fill = document.getElementById("overview-habit-fill");
    if (fill) fill.style.width = `${rate}%`;

    const list = document.getElementById("overview-habit-list");
    if (!list) return;
    list.replaceChildren();

    if (!habits.length) {
        list.appendChild(overviewElement("p", "empty-state", "No habits yet. Add your first habit."));
        return;
    }

    habits.forEach(habit => {
        const isComplete = Boolean(habit.completions?.[today]);
        const row = overviewElement("label", "overview-habit-row");
        const checkbox = overviewElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isComplete;
        checkbox.setAttribute("aria-label", `${isComplete ? "Mark incomplete" : "Complete"} ${habit.name}`);
        checkbox.addEventListener("change", async () => {
            checkbox.disabled = true;
            try {
                await toggleHabitCompletion(habit.id, checkbox.checked);
                await refreshOverviewDashboard();
            } catch (error) {
                console.error("Overview habit update failed:", error);
                checkbox.checked = isComplete;
                showAppDialog("Could not update this habit. Please try again.");
            } finally {
                checkbox.disabled = false;
            }
        });

        const name = overviewElement("span",
            isComplete ? "overview-habit-name is-complete" : "overview-habit-name",
            habit.name);
        const status = overviewElement("small", "overview-habit-status", isComplete ? "Done" : "Not done");
        row.append(checkbox, name, status);
        list.appendChild(row);
    });
}

function renderOverviewPortfolio(milestones, projects, tasks, today) {
    const summary = document.getElementById("overview-portfolio-summary");
    const deadlines = document.getElementById("overview-upcoming-deadlines");
    if (!summary || !deadlines) return;
    summary.replaceChildren();
    deadlines.replaceChildren();

    const milestoneDone = milestones.filter(item => item.status === "completed").length;
    const projectDone = projects.filter(item => item.status === "completed").length;
    [
        ["Milestones", `${milestoneDone}/${milestones.length}`, milestones.length ? Math.round(milestoneDone / milestones.length * 100) : 0, "#"],
        ["Projects", `${projectDone}/${projects.length}`, projects.length ? Math.round(projectDone / projects.length * 100) : 0, "#"]
    ].forEach(([label, count, rate]) => {
        const card = overviewElement("div", "overview-portfolio-item");
        card.append(overviewElement("strong", "", count), overviewElement("small", "", label));
        const track = overviewElement("div", "overview-mini-track");
        const fill = overviewElement("span");
        fill.style.width = `${rate}%`;
        track.appendChild(fill);
        card.appendChild(track);
        summary.appendChild(card);
    });

    const upcoming = [];
    milestones.filter(item => item.status !== "completed" && item.targetDate >= today)
        .forEach(item => upcoming.push({ title: item.title, date: item.targetDate, type: "Milestone" }));
    projects.filter(item => item.status !== "completed" && item.deadline >= today)
        .forEach(item => upcoming.push({ title: item.name || item.title, date: item.deadline, type: "Project" }));
    tasks.filter(item => !item.completed && item.date >= today)
        .forEach(item => upcoming.push({ title: item.title, date: item.date, type: "Task" }));
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    if (!upcoming.length) {
        deadlines.appendChild(overviewElement("p", "empty-state", "No upcoming deadlines."));
        return;
    }
    upcoming.slice(0, 5).forEach(item => {
        const row = overviewElement("div", "overview-deadline-row");
        row.append(overviewElement("span", "", `${item.type}: ${item.title}`), overviewElement("small", "", overviewFormatDate(item.date)));
        deadlines.appendChild(row);
    });
}

function overviewAddDays(dateKey, days) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + days);
    return overviewTodayKey(date);
}
