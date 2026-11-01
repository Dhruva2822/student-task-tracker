
const STORAGE_KEY = "studyflow-data-v1";

const $ = (id) => document.getElementById(id);

const taskForm = $("taskForm");
const taskInput = $("taskInput");
const taskDate = $("taskDate");
const taskCategory = $("taskCategory");
const taskPriority = $("taskPriority");
const studyMinutes = $("studyMinutes");
const taskList = $("taskList");
const taskFilter = $("taskFilter");
const taskSearch = $("taskSearch");
const emptyMessage = $("emptyMessage");
const themeToggle = $("themeToggle");
const goalInput = $("goalInput");

let tasks = [];
let settings = { dailyGoal: 2, theme: "light" };
let taskChart = null;
let weeklyChart = null;

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function makeId() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            tasks,
            settings
        }));
    } catch (error) {
        console.error("Unable to save StudyFlow data:", error);
    }
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const data = JSON.parse(raw);

        if (Array.isArray(data.tasks)) {
            tasks = data.tasks.filter((task) =>
                task &&
                typeof task.id === "string" &&
                typeof task.title === "string" &&
                typeof task.date === "string" &&
                typeof task.completed === "boolean"
            );
        }

        if (data.settings && typeof data.settings === "object") {
            const goal = Number(data.settings.dailyGoal);
            settings.dailyGoal =
                Number.isFinite(goal) ? Math.min(24, Math.max(1, goal)) : 2;
            settings.theme = data.settings.theme === "dark" ? "dark" : "light";
        }
    } catch (error) {
        console.error("Unable to read saved StudyFlow data:", error);
        tasks = [];
    }
}

function isOverdue(task) {
    return !task.completed && task.date < localDateString();
}

function formatDate(dateString) {
    if (!dateString) return "No date";
    const date = new Date(`${dateString}T12:00:00`);
    return Number.isNaN(date.getTime())
        ? dateString
        : date.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
}

function showToday() {
    $("todayLabel").textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function renderTasks() {
    const filter = taskFilter.value;
    const search = taskSearch.value.trim().toLowerCase();

    const filteredTasks = tasks
        .filter((task) => {
            if (filter === "pending" && task.completed) return false;
            if (filter === "completed" && !task.completed) return false;
            if (filter === "overdue" && !isOverdue(task)) return false;

            return `${task.title} ${task.category || ""}`
                .toLowerCase()
                .includes(search);
        })
        .sort((a, b) => {
            if (a.completed !== b.completed) {
                return Number(a.completed) - Number(b.completed);
            }

            const priority = { High: 0, Medium: 1, Low: 2 };
            return (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1)
                || a.date.localeCompare(b.date);
        });

    taskList.innerHTML = filteredTasks.map((task) => {
        const priority = ["High", "Medium", "Low"].includes(task.priority)
            ? task.priority
            : "Medium";

        const category = task.category || "General";
        const minutes = Number(task.minutes) || 0;
        const overdue = isOverdue(task);

        return `
            <div class="task-item ${task.completed ? "is-completed" : ""}">
                <input class="task-check" type="checkbox"
                    data-action="toggle" data-id="${escapeHTML(task.id)}"
                    aria-label="Complete ${escapeHTML(task.title)}"
                    ${task.completed ? "checked" : ""}>
                <div class="task-info">
                    <strong>${escapeHTML(task.title)}</strong>
                    <div class="task-meta">
                        <span>${escapeHTML(category)}</span>
                        <span class="pill priority-${priority.toLowerCase()}">
                            ${priority}
                        </span>
                        <span class="${overdue ? "status-overdue" : ""}">
                            ${overdue ? "Overdue · " : "Due "}
                            ${escapeHTML(formatDate(task.date))}
                        </span>
                        <span>${minutes} min</span>
                    </div>
                </div>
                <button type="button" class="delete-task"
                    data-action="delete" data-id="${escapeHTML(task.id)}"
                    aria-label="Delete ${escapeHTML(task.title)}">✕</button>
            </div>
        `;
    }).join("");

    emptyMessage.hidden = filteredTasks.length > 0;
}

function renderStats() {
    const completed = tasks.filter((task) => task.completed).length;
    const pending = tasks.length - completed;
    const overdue = tasks.filter(isOverdue).length;

    $("totalTasks").textContent = tasks.length;
    $("completedTasks").textContent = completed;
    $("pendingTasks").textContent = pending;
    $("overdueTasks").textContent = overdue;
}

function getTodayCompletedMinutes() {
    const today = localDateString();

    return tasks.reduce((total, task) => {
        // Only count tasks completed today, not tasks completed in the past.
        if (task.completed && task.completedAt === today) {
            return total + (Number(task.minutes) || 0);
        }
        return total;
    }, 0);
}

function renderGoal() {
    const minutes = getTodayCompletedMinutes();
    const target = settings.dailyGoal * 60;
    const percent = Math.min(100, Math.round((minutes / target) * 100));

    $("goalPercent").textContent = `${percent}%`;
    $("goalHours").textContent =
        `${(minutes / 60).toFixed(1)} / ${settings.dailyGoal} hrs`;
    goalInput.value = settings.dailyGoal;

    $("goalRing").style.background =
        `conic-gradient(#7964ee ${percent}%, var(--border) ${percent}%)`;
}

function renderCharts() {
    if (typeof Chart === "undefined") return;

    const completed = tasks.filter((task) => task.completed).length;
    const pending = tasks.length - completed;
    const textColor = getComputedStyle(document.body)
        .getPropertyValue("--muted").trim() || "#85869d";
    const gridColor = getComputedStyle(document.body)
        .getPropertyValue("--border").trim() || "#ececf5";

    if (taskChart) taskChart.destroy();

    taskChart = new Chart($("taskChart"), {
        type: "doughnut",
        data: {
            labels: ["Completed", "Pending"],
            datasets: [{
                data: [completed, pending],
                backgroundColor: ["#49c99a", "#7964ee"],
                borderWidth: 0,
                hoverOffset: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: {
                legend: { display: false }
            }
        }
    });

    const days = [];
    const dayKeys = [];
    const minutesByDay = {};

    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setDate(date.getDate() - offset);

        const key = localDateString(date);
        dayKeys.push(key);
        days.push(date.toLocaleDateString(undefined, { weekday: "short" }));
        minutesByDay[key] = 0;
    }

    tasks.forEach((task) => {
        if (task.completed && task.completedAt &&
            Object.hasOwn(minutesByDay, task.completedAt)) {
            minutesByDay[task.completedAt] += Number(task.minutes) || 0;
        }
    });

    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart($("weeklyChart"), {
        type: "bar",
        data: {
            labels: days,
            datasets: [{
                label: "Study minutes",
                data: dayKeys.map((key) => minutesByDay[key]),
                backgroundColor: [
                    "#c7baff", "#b5a4ff", "#a794ff",
                    "#8e7af5", "#7964ee", "#9a87f7", "#49c99a"
                ],
                borderRadius: 7,
                maxBarThickness: 36
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: textColor, precision: 0 },
                    grid: { color: gridColor },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderAll() {
    renderTasks();
    renderStats();
    renderGoal();
    renderCharts();
}

taskForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = taskInput.value.trim();
    const date = taskDate.value;
    const minutes = Number(studyMinutes.value);

    if (!title || !date) {
        alert("Please enter a task name and due date.");
        return;
    }

    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
        alert("Study time must be between 0 and 1440 minutes.");
        return;
    }

    tasks.push({
        id: makeId(),
        title,
        date,
        category: taskCategory.value,
        priority: taskPriority.value,
        minutes,
        completed: false,
        completedAt: null,
        createdAt: localDateString()
    });

    taskInput.value = "";
    studyMinutes.value = "30";
    saveData();
    renderAll();
    taskInput.focus();
});

taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest('[data-action="toggle"]');
    if (!checkbox) return;

    const task = tasks.find((item) => item.id === checkbox.dataset.id);
    if (!task) return;

    task.completed = checkbox.checked;
    task.completedAt = task.completed ? localDateString() : null;

    saveData();
    renderAll();
});

taskList.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="delete"]');
    if (!button) return;

    const task = tasks.find((item) => item.id === button.dataset.id);
    if (!task) return;

    if (!confirm(`Delete "${task.title}"?`)) return;

    tasks = tasks.filter((item) => item.id !== task.id);
    saveData();
    renderAll();
});

taskFilter.addEventListener("change", renderTasks);
taskSearch.addEventListener("input", renderTasks);

$("saveGoal").addEventListener("click", () => {
    const goal = Number(goalInput.value);

    if (!Number.isInteger(goal) || goal < 1 || goal > 24) {
        alert("Choose a daily goal from 1 to 24 whole hours.");
        return;
    }

    settings.dailyGoal = goal;
    saveData();
    renderGoal();
});

function applyTheme() {
    const dark = settings.theme === "dark";
    document.body.classList.toggle("dark", dark);
    themeToggle.textContent = dark ? "☀️ Light mode" : "🌙 Dark mode";
    themeToggle.setAttribute("aria-pressed", String(dark));
}

themeToggle.addEventListener("click", () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    saveData();
    applyTheme();
    renderCharts();
});

loadData();
showToday();
applyTheme();

taskDate.min = localDateString();

renderAll();
