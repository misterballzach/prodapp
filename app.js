// Make state global for easier testing/verification
window.appState = {
    currentDate: new Date(),
    selectedDate: new Date(),
    selectedCategory: 'all',
    categories: [
        { id: 'all', name: 'All Categories', color: '#888888' },
        { id: 'work', name: 'Work', color: '#ff4d4f' },
        { id: 'personal', name: 'Personal', color: '#52c41a' },
        { id: 'health', name: 'Health', color: '#1890ff' }
    ],
    tasks: [] // Array of task objects: { id, title, categoryId, date (YYYY-MM-DD), completed }
};

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const state = window.appState;

    // Normalize date to YYYY-MM-DD
    const formatDate = (date) => {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    };

    // --- DOM Elements ---
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const selectedDateDisplay = document.getElementById('selected-date-display');

    const categoryList = document.getElementById('category-list');
    const newTaskCategorySelect = document.getElementById('new-task-category');

    const taskList = document.getElementById('task-list');
    const newTaskInput = document.getElementById('new-task-input');
    const addTaskBtn = document.getElementById('add-task-btn');

    // --- Calendar Logic ---
    const renderCalendar = () => {
        calendarGrid.innerHTML = '';

        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthNames = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"];

        monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDiv);
        }

        // Days
        const todayStr = formatDate(new Date());
        const selectedStr = formatDate(state.selectedDate);

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = i;

            const currentDayStr = formatDate(new Date(year, month, i));

            if (currentDayStr === todayStr) dayDiv.classList.add('today');
            if (currentDayStr === selectedStr) dayDiv.classList.add('selected');

            // Check if day has tasks
            if (state.tasks.some(t => t.date === currentDayStr)) {
                dayDiv.classList.add('has-tasks');
            }

            dayDiv.addEventListener('click', () => {
                state.selectedDate = new Date(year, month, i);
                renderCalendar(); // Re-render to update selected styling
                updateDateDisplay();
                renderTasks();
            });

            calendarGrid.appendChild(dayDiv);
        }
    };

    prevMonthBtn.addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar();
    });

    const updateDateDisplay = () => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        selectedDateDisplay.textContent = state.selectedDate.toLocaleDateString(undefined, options);
    };

    // --- Category Logic ---
    const renderCategories = () => {
        categoryList.innerHTML = '';

        // Only populate select dropdown if it's empty to preserve user selection
        const shouldPopulateSelect = newTaskCategorySelect.options.length === 0;

        state.categories.forEach(cat => {
            // Sidebar List
            const li = document.createElement('li');
            li.className = `category-item ${state.selectedCategory === cat.id ? 'active' : ''}`;
            li.innerHTML = `
                <span class="category-color-dot" style="background-color: ${cat.color}"></span>
                ${cat.name}
            `;
            li.addEventListener('click', () => {
                state.selectedCategory = cat.id;
                renderCategories(); // Update active class
                renderTasks();
            });
            categoryList.appendChild(li);

            // Select Dropdown (exclude 'All Categories')
            if (shouldPopulateSelect && cat.id !== 'all') {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                newTaskCategorySelect.appendChild(option);
            }
        });
    };

    // --- Task Rollover Logic ---
    const checkAndRolloverTasks = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to midnight
        const todayStr = formatDate(today);

        // Find tasks that are incomplete and from a date before today
        const overdueTasks = state.tasks.filter(task => {
            if (task.completed) return false;
            const taskDate = new Date(task.date + 'T00:00:00'); // Parse YYYY-MM-DD
            return taskDate < today;
        });

        overdueTasks.forEach(task => {
            // Check if this task has already been rolled over to today
            const alreadyRolledOver = state.tasks.some(t =>
                t.title.toLowerCase() === task.title.toLowerCase() &&
                t.categoryId === task.categoryId &&
                t.date === todayStr
            );

            if (!alreadyRolledOver) {
                const taskDate = new Date(task.date + 'T00:00:00');
                // Calculate days overdue
                const diffTime = Math.abs(today - taskDate);
                const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Base priority is 0, add 1 for every day overdue
                const newPriority = (task.priority || 0) + daysOverdue;

                const rolledOverTask = {
                    id: Date.now().toString() + Math.random().toString(36).substring(7),
                    title: task.title,
                    categoryId: task.categoryId,
                    date: todayStr,
                    completed: false,
                    priority: newPriority,
                    isRollover: true,
                    daysOverdue: daysOverdue
                };

                state.tasks.push(rolledOverTask);
                // Mark original task as completed so it doesn't keep rolling over,
                // OR delete it. Marking as completed to preserve history.
                task.completed = true;
                task.rolloverStatus = 'rolled-over'; // Add a flag to indicate why it's completed
            }
        });
    };

    // --- Task Logic ---
    const toggleTaskCompletion = (title, completed) => {
        // Sync across all categories for tasks with the same title
        state.tasks.forEach(task => {
            if (task.title.toLowerCase() === title.toLowerCase()) {
                // Don't uncheck past rolled-over tasks that were auto-completed by the rollover system
                if (completed === false && task.rolloverStatus === 'rolled-over') {
                    return;
                }
                task.completed = completed;
            }
        });
        renderTasks();
    };

    const deleteTask = (id) => {
        state.tasks = state.tasks.filter(t => t.id !== id);
        renderTasks();
        renderCalendar(); // Re-render to update task dots
    };

    const renderTasks = () => {
        taskList.innerHTML = '';

        const selectedDateStr = formatDate(state.selectedDate);

        let filteredTasks = state.tasks.filter(task => {
            const matchesDate = task.date === selectedDateStr;
            const matchesCategory = state.selectedCategory === 'all' || task.categoryId === state.selectedCategory;
            return matchesDate && matchesCategory;
        });

        // Sort tasks: incomplete first, then by priority (descending)
        filteredTasks.sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            return (b.priority || 0) - (a.priority || 0);
        });

        if (filteredTasks.length === 0) {
            taskList.innerHTML = `<li class="empty-state">No tasks for this date/category.</li>`;
            return;
        }

        filteredTasks.forEach(task => {
            const category = state.categories.find(c => c.id === task.categoryId);

            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;

            // XSS Prevention: Use elements and textContent instead of template literal
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = task.completed;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'task-content';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'task-title';
            titleSpan.textContent = task.title; // Safe text insertion

            const badgesContainer = document.createElement('div');
            badgesContainer.className = 'task-badges';

            const badgeSpan = document.createElement('span');
            badgeSpan.className = 'task-category-badge';
            badgeSpan.style.backgroundColor = category.color;
            badgeSpan.textContent = category.name;

            badgesContainer.appendChild(badgeSpan);

            // Add priority/overdue badge if applicable
            if (task.priority > 0 && !task.completed) {
                const priorityBadge = document.createElement('span');
                priorityBadge.className = 'task-priority-badge';
                if (task.priority > 3) priorityBadge.classList.add('high-priority');

                const icon = document.createElement('span');
                icon.innerHTML = '&#9888;'; // Warning icon

                const text = document.createElement('span');
                text.textContent = `Priority: ${task.priority} (${task.daysOverdue}d overdue)`;

                priorityBadge.appendChild(icon);
                priorityBadge.appendChild(text);
                badgesContainer.appendChild(priorityBadge);
            }

            contentDiv.appendChild(titleSpan);
            contentDiv.appendChild(badgesContainer);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-task-btn';
            deleteBtn.innerHTML = '&times;';

            li.appendChild(checkbox);
            li.appendChild(contentDiv);
            li.appendChild(deleteBtn);

            checkbox.addEventListener('change', (e) => {
                toggleTaskCompletion(task.title, e.target.checked);
            });

            deleteBtn.addEventListener('click', () => {
                deleteTask(task.id);
            });

            taskList.appendChild(li);
        });
    };

    const addTask = () => {
        const title = newTaskInput.value.trim();
        if (!title) return;

        const categoryId = newTaskCategorySelect.value;
        const dateStr = formatDate(state.selectedDate);

        // Check if there is an existing task with same title to inherit completion status
        const existingSimilarTask = state.tasks.find(t => t.title.toLowerCase() === title.toLowerCase());
        const isCompleted = existingSimilarTask ? existingSimilarTask.completed : false;

        const newTask = {
            id: Date.now().toString(),
            title: title,
            categoryId: categoryId,
            date: dateStr,
            completed: isCompleted,
            priority: 0 // Default priority
        };

        state.tasks.push(newTask);

        newTaskInput.value = '';
        renderTasks();
        renderCalendar(); // Re-render to update task dots
    };

    addTaskBtn.addEventListener('click', addTask);
    newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // --- Initialization ---
    checkAndRolloverTasks();
    renderCategories();
    updateDateDisplay();
    renderCalendar();
    renderTasks();

    // Expose functions globally for testing script
    window.renderTasks = renderTasks;
    window.renderCalendar = renderCalendar;
    window.checkAndRolloverTasks = checkAndRolloverTasks;
});
