// ==========================================
// 90-DAY COMMAND CENTER
// REPORTS & ANALYTICS — VERSION 0.9
// Reads existing IndexedDB records; does not modify source records.
// ==========================================

let reportCache = {
    tasks: [],
    habits: [],
    milestones: [],
    projects: []
};

let reportCurrentMetrics = null;

function reportLocalDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function reportDateFromOffset(offset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    return reportLocalDate(date);
}

function reportPercent(value) {
    const number = Number(value);
    return `${Math.round(Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0)}%`;
}

function reportSetText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function reportSetFill(id, value) {
    const element = document.getElementById(id);
    if (element) element.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

function reportInRange(dateKey, start, end) {
    return Boolean(dateKey && dateKey >= start && dateKey <= end);
}

function reportTimestampDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : reportLocalDate(date);
}

function reportGetRange() {
    const selected = document.getElementById("report-period")?.value || "30";
    const end = reportLocalDate();

    if (selected === "all") {
        const candidates = [];
        reportCache.tasks.forEach(task => {
            if (task.date) candidates.push(task.date);
            const completed = reportTimestampDate(task.completedAt);
            if (completed) candidates.push(completed);
        });
        reportCache.habits.forEach(habit => {
            if (habit.createdAt) {
                const created = reportTimestampDate(habit.createdAt);
                if (created) candidates.push(created);
            }
            Object.keys(habit.completions || {}).forEach(key => candidates.push(key));
        });
        reportCache.milestones.forEach(item => {
            const created = reportTimestampDate(item.createdAt);
            if (created) candidates.push(created);
            if (item.targetDate) candidates.push(item.targetDate);
        });
        reportCache.projects.forEach(item => {
            const created = reportTimestampDate(item.createdAt);
            if (created) candidates.push(created);
            if (item.startDate) candidates.push(item.startDate);
        });
        candidates.push(end);
        candidates.sort();
        return { start: candidates[0] || end, end, label: "All time" };
    }

    const days = Math.max(1, Number(selected) || 30);
    return {
        start: reportDateFromOffset(days - 1),
        end,
        label: `Last ${days} days`
    };
}

function reportCalculateMetrics() {
    const range = reportGetRange();
    const today = reportLocalDate();

    // Completed tasks are counted only when their real completion timestamp exists.
    const completedTasks = reportCache.tasks.filter(task => {
        if (!task.completed) return false;
        const completedDate = reportTimestampDate(task.completedAt);
        // Older records may predate completion timestamps. Include them in All Time,
        // but never assign them an invented date in a limited reporting period.
        if (!completedDate) return range.label === "All time";
        return reportInRange(completedDate, range.start, range.end);
    });

    // Every task KPI uses the selected reporting period.
    // Completed tasks are dated by their actual completion timestamp.
    // Open tasks are dated by their due date because they have no completion timestamp.
    const openTasks = reportCache.tasks.filter(task => !task.completed);
    const periodOpenTasks = openTasks.filter(task => {
        if (task.date) return reportInRange(task.date, range.start, range.end);
        return range.label === "All time";
    });
    const periodOverdueTasks = periodOpenTasks.filter(task =>
        Boolean(task.date) && task.date < today
    );
    const periodPendingTasks = periodOpenTasks.length - periodOverdueTasks.length;
    // Retain current workload totals for the CSV detail section.
    const currentOverdueTasks = openTasks.filter(task => Boolean(task.date) && task.date < today);
    const currentPendingTasks = openTasks.filter(task => !task.date || task.date >= today);
    const taskDenominator = completedTasks.length + periodOpenTasks.length;
    const taskRate = taskDenominator
        ? (completedTasks.length / taskDenominator) * 100
        : 0;

    // Habit consistency = checked habit-days / eligible habit-days in selected period.
    // Habits are counted only from their recorded creation date onward.
    let habitOpportunities = 0;
    let habitCompletions = 0;
    reportCache.habits.forEach(habit => {
        const createdDate = reportTimestampDate(habit.createdAt);
        const eligibleStart = createdDate && createdDate > range.start ? createdDate : range.start;
        if (eligibleStart > range.end) return;

        const cursor = new Date(`${eligibleStart}T12:00:00`);
        const last = new Date(`${range.end}T12:00:00`);
        while (cursor <= last) {
            const key = reportLocalDate(cursor);
            habitOpportunities += 1;
            if (habit.completions?.[key]) habitCompletions += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
    });
    const habitRate = habitOpportunities
        ? (habitCompletions / habitOpportunities) * 100
        : null;

    // Milestones and projects have current status/progress only, not historical snapshots.
    // Their values therefore represent current portfolio status for every selected period.
    const milestoneRate = reportCache.milestones.length
        ? reportCache.milestones.reduce((sum, item) =>
            sum + Math.max(0, Math.min(100, Number(item.progress) || 0)), 0
        ) / reportCache.milestones.length
        : null;

    const projectRate = reportCache.projects.length
        ? reportCache.projects.reduce((sum, item) =>
            sum + Math.max(0, Math.min(100, Number(item.progress) || 0)), 0
        ) / reportCache.projects.length
        : null;

    const scoreParts = [taskRate, habitRate, milestoneRate, projectRate]
        .filter(value => value !== null);
    const productivity = scoreParts.length
        ? scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length
        : 0;

    const donutDenominator = completedTasks.length + periodOpenTasks.length;
    const completionRate = donutDenominator
        ? (completedTasks.length / donutDenominator) * 100
        : 0;

    // Build chart buckets from the selected reporting period.
    // 7 days = daily bars; longer periods = readable grouped date ranges.
    const selectedPeriod = document.getElementById("report-period")?.value || "30";
    const startDate = new Date(`${range.start}T12:00:00`);
    const endDate = new Date(`${range.end}T12:00:00`);
    const totalDays = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);
    const bucketCount = selectedPeriod === "7"
        ? Math.min(7, totalDays)
        : Math.min(12, totalDays);
    const bucketSize = Math.ceil(totalDays / bucketCount);
    const activityBuckets = [];

    for (let index = 0; index < bucketCount; index++) {
        const bucketStart = new Date(startDate);
        bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
        if (bucketStart > endDate) break;

        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketEnd.getDate() + bucketSize - 1);
        if (bucketEnd > endDate) bucketEnd.setTime(endDate.getTime());

        const startKey = reportLocalDate(bucketStart);
        const endKey = reportLocalDate(bucketEnd);
        const count = reportCache.tasks.filter(task => {
            const completedDate = reportTimestampDate(task.completedAt);
            return task.completed && reportInRange(completedDate, startKey, endKey);
        }).length;

        const startLabel = bucketStart.toLocaleDateString(undefined, {
            month: "short", day: "numeric"
        });
        const endLabel = bucketEnd.toLocaleDateString(undefined, {
            month: "short", day: "numeric"
        });

        activityBuckets.push({
            key: startKey === endKey ? startKey : `${startKey} to ${endKey}`,
            label: startKey === endKey ? startLabel : `${startLabel}–${endLabel}`,
            count
        });
    }

    return {
        range,
        completedTasks: completedTasks.length,
        pendingTasks: periodPendingTasks,
        overdueTasks: periodOverdueTasks.length,
        currentPendingTasks: currentPendingTasks.length,
        currentOverdueTasks: currentOverdueTasks.length,
        taskRate,
        taskDenominator,
        periodOpenTasks: periodOpenTasks.length,
        completionRate,
        habitRate,
        habitCompletions,
        habitOpportunities,
        milestoneRate,
        projectRate,
        productivity,
        scorePartsCount: scoreParts.length,
        activityBuckets,
        totalTasks: reportCache.tasks.length,
        totalHabits: reportCache.habits.length,
        totalMilestones: reportCache.milestones.length,
        totalProjects: reportCache.projects.length
    };
}

function reportRenderActivityChart(days) {
    const container = document.getElementById("report-weekly-chart");
    if (!container) return;
    container.replaceChildren();

    const max = Math.max(1, ...days.map(day => day.count));
    days.forEach(day => {
        const column = document.createElement("div");
        column.className = "chart-day";

        const value = document.createElement("span");
        value.className = "chart-day-value";
        value.textContent = day.count;

        const track = document.createElement("div");
        track.className = "chart-bar-track";
        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = `${day.count ? Math.max(5, (day.count / max) * 100) : 0}%`;
        bar.setAttribute("title", `${day.count} completed on ${day.key}`);
        track.appendChild(bar);

        const label = document.createElement("span");
        label.className = "chart-day-label";
        label.textContent = day.label;

        column.append(value, track, label);
        container.appendChild(column);
    });
}

function reportRender(metrics) {
    reportCurrentMetrics = metrics;

    reportSetText("report-productivity-score", reportPercent(metrics.productivity));
    reportSetText("report-score-caption",
        metrics.scorePartsCount
            ? `${metrics.scorePartsCount} active performance areas`
            : "Add activity to calculate your score"
    );
    reportSetFill("report-score-fill", metrics.productivity);

    reportSetText("report-total-completed", metrics.completedTasks);
    reportSetText("report-total-pending", metrics.pendingTasks);
    reportSetText("report-total-overdue", metrics.overdueTasks);
    const pendingCaption = document.querySelector("#report-total-pending")?.parentElement?.querySelector("p");
    if (pendingCaption) pendingCaption.textContent = "Open tasks due in selected period";
    const overdueCaption = document.querySelector("#report-total-overdue")?.parentElement?.querySelector("p");
    if (overdueCaption) overdueCaption.textContent = "Overdue tasks due in selected period";

    reportRenderActivityChart(metrics.activityBuckets);

    reportSetText("report-completion-rate", reportPercent(metrics.completionRate));
    reportSetText("report-completion-caption",
        `${metrics.completedTasks} completed · ${metrics.periodOpenTasks} remaining in selected period`
    );
    const donut = document.getElementById("report-completion-donut");
    if (donut) {
        donut.style.background = `conic-gradient(var(--primary) ${metrics.completionRate}%, #e9e7f1 ${metrics.completionRate}% 100%)`;
        donut.setAttribute("aria-label", `${Math.round(metrics.completionRate)} percent of tasks complete in the selected period`);
    }

    reportSetText("report-habit-consistency", metrics.habitRate === null ? "—" : reportPercent(metrics.habitRate));
    reportSetFill("report-habit-fill", metrics.habitRate || 0);
    reportSetText("report-habit-caption",
        metrics.habitRate === null
            ? "No habits recorded for this period."
            : `${metrics.habitCompletions} completed habit-days out of ${metrics.habitOpportunities} possible.`
    );

    reportSetText("report-milestone-rate", metrics.milestoneRate === null ? "—" : reportPercent(metrics.milestoneRate));
    reportSetFill("report-milestone-fill", metrics.milestoneRate || 0);
    reportSetText("report-milestone-caption",
        metrics.totalMilestones
            ? `${reportCache.milestones.filter(item => item.status === "completed").length} completed out of ${metrics.totalMilestones} milestones · current portfolio`
            : "No milestones recorded yet."
    );

    reportSetText("report-project-rate", metrics.projectRate === null ? "—" : reportPercent(metrics.projectRate));
    reportSetFill("report-project-fill", metrics.projectRate || 0);
    reportSetText("report-project-caption",
        metrics.totalProjects
            ? `${reportCache.projects.filter(item => item.status === "completed").length} completed out of ${metrics.totalProjects} projects · current portfolio`
            : "No projects recorded yet."
    );

    const breakdown = [
        ["tasks", metrics.taskRate, metrics.taskDenominator ? `${reportPercent(metrics.taskRate)} completion` : "No task data"],
        ["habits", metrics.habitRate, metrics.habitRate === null ? "No habit data" : reportPercent(metrics.habitRate)],
        ["milestones", metrics.milestoneRate, metrics.milestoneRate === null ? "No milestone data" : `${reportPercent(metrics.milestoneRate)} average progress`],
        ["projects", metrics.projectRate, metrics.projectRate === null ? "No project data" : `${reportPercent(metrics.projectRate)} average progress`]
    ];

    breakdown.forEach(([key, value, label]) => {
        reportSetText(`report-breakdown-${key}`, label);
        reportSetFill(`report-breakdown-${key}-fill`, value || 0);
    });
}

async function refreshReports() {
    const [tasks, habits, milestones, projects] = await Promise.all([
        getAllTasks(),
        getAllHabits(),
        getAllMilestones(),
        getAllProjects()
    ]);

    reportCache = { tasks, habits, milestones, projects };
    const metrics = reportCalculateMetrics();
    reportRender(metrics);
    return metrics;
}

function reportExportCsv() {
    if (!reportCurrentMetrics) return;
    const m = reportCurrentMetrics;
    const rows = [
        ["Habit Builder Tracker — Performance Report"],
        ["Reporting period", m.range.label],
        ["Generated", new Date().toLocaleString()],
        [],
        ["Metric", "Value"],
        ["Productivity score", reportPercent(m.productivity)],
        ["Tasks completed in period", m.completedTasks],
        ["Remaining tasks due in selected period", m.periodOpenTasks],
        ["Pending tasks in selected period", m.pendingTasks],
        ["Overdue tasks in selected period", m.overdueTasks],
        ["Current pending tasks (not overdue)", m.currentPendingTasks],
        ["Current overdue tasks", m.currentOverdueTasks],
        ["Task completion rate", m.taskDenominator ? reportPercent(m.taskRate) : "No data"],
        ["Habit consistency", m.habitRate === null ? "No data" : reportPercent(m.habitRate)],
        ["Habit completions", m.habitCompletions],
        ["Eligible habit-days", m.habitOpportunities],
        ["Average milestone progress", m.milestoneRate === null ? "No data" : reportPercent(m.milestoneRate)],
        ["Average project progress", m.projectRate === null ? "No data" : reportPercent(m.projectRate)],
        ["Total tasks stored", m.totalTasks],
        ["Total habits stored", m.totalHabits],
        ["Total milestones stored", m.totalMilestones],
        ["Total projects stored", m.totalProjects],
        [],
        ["Note", "Milestone and project progress are current portfolio snapshots; historical status changes are not stored."]
    ];

    const csv = rows.map(row => row.map(value => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");

    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `habit-builder-tracker-report-${reportLocalDate()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function initializeReportPrintButton() {
    const exportButton = document.getElementById("export-report-btn");
    if (!exportButton || document.getElementById("print-report-btn")) return;

    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.id = "print-report-btn";
    printButton.className = exportButton.className;
    printButton.textContent = "Print / Save PDF";
    printButton.addEventListener("click", () => window.print());
    exportButton.insertAdjacentElement("afterend", printButton);

    const style = document.createElement("style");
    style.textContent = `
        @media print {
            body { background: #fff !important; }
            .sidebar, .sidebar-overlay, .report-toolbar, .mobile-menu-btn,
            .nav-item, .footer { display: none !important; }
            .page-section { display: none !important; }
            #reports.page-section { display: block !important; }
            #reports [hidden] { display: block !important; }
            #reports { color: #111 !important; }
            .report-panel, .report-score-card, .report-highlight-card {
                break-inside: avoid; box-shadow: none !important;
            }
            #print-report-btn, #export-report-btn { display: none !important; }
        }
    `;
    document.head.appendChild(style);
}

async function initializeReports() {
    const period = document.getElementById("report-period");
    const exportButton = document.getElementById("export-report-btn");
    if (!period || !exportButton) {
        console.warn("Reports interface not found; skipping reports initialization.");
        return;
    }

    if (period.dataset.reportListenerAttached !== "true") {
        const updatePeriod = () => {
            refreshReports().catch(error => {
                console.error("Report refresh failed:", error);
                showAppDialog("Unable to refresh reports. Please check the browser console.");
            });
        };
        period.addEventListener("change", updatePeriod);
        period.dataset.reportListenerAttached = "true";
    }
    if (exportButton.dataset.reportListenerAttached !== "true") {
        exportButton.addEventListener("click", reportExportCsv);
        exportButton.dataset.reportListenerAttached = "true";
    }
    initializeReportPrintButton();

    try {
        await refreshReports();
    } catch (error) {
        console.error("Unable to calculate reports:", error);
        const chart = document.getElementById("report-weekly-chart");
        if (chart) chart.textContent = "Reports could not be loaded. Please refresh the page.";
    }
}
