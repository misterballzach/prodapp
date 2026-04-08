import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Configure transformers.js for browser usage
env.allowLocalModels = false;

// --- Global State & Configuration ---
window.appState = {
    currentDate: new Date(),
    selectedDate: new Date(),
    selectedCategory: 'all',
    categories: [
        { id: 'all', name: 'All Views', color: '#64748b', icon: 'fa-layer-group' },
        { id: 'minimum', name: 'Minimum Day', color: '#10b981', icon: 'fa-shield-heart' },
        { id: 'daily', name: 'Daily System', color: '#3b82f6', icon: 'fa-sun' },
        { id: 'quests', name: 'Quests', color: '#ec4899', icon: 'fa-bolt' },
        { id: 'weekly', name: 'Weekly System', color: '#f59e0b', icon: 'fa-calendar-week' },
        { id: 'monthly', name: 'Monthly System', color: '#8b5cf6', icon: 'fa-calendar-alt' }
    ],
    tasks: [],
    initializedDates: []
};

document.addEventListener('DOMContentLoaded', () => {
    // --- Persistence ---
    const loadState = () => {
        const saved = localStorage.getItem('bampot-os-state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                window.appState.tasks = parsed.tasks || [];
                window.appState.initializedDates = parsed.initializedDates || [];
            } catch (e) {
                console.error("Failed to load state", e);
            }
        }
    };

    const saveState = () => {
        localStorage.setItem('bampot-os-state', JSON.stringify({
            tasks: window.appState.tasks,
            initializedDates: window.appState.initializedDates
        }));
    };

    loadState();
    const state = window.appState;

    // Normalize date to YYYY-MM-DD local time
    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // --- DOM Elements ---
    const elements = {
        sidebar: document.getElementById('sidebar'),
        overlay: document.getElementById('sidebar-overlay'),
        menuToggleBtn: document.getElementById('menu-toggle-btn'),
        closeSidebarBtn: document.getElementById('close-sidebar-btn'),

        // AI Elements
        openAiModalBtn: document.getElementById('open-ai-modal-btn'),
        aiModalOverlay: document.getElementById('ai-modal-overlay'),
        aiPromptInput: document.getElementById('ai-prompt-input'),
        cancelAiBtn: document.getElementById('cancel-ai-btn'),
        runAiBtn: document.getElementById('run-ai-btn'),
        aiStatus: document.getElementById('ai-status'),
        aiStatusText: document.getElementById('ai-status-text'),
        aiProgress: document.getElementById('ai-progress'),
        calendarGrid: document.getElementById('calendar-grid'),
        monthYearDisplay: document.getElementById('current-month-year'),
        prevMonthBtn: document.getElementById('prev-month'),
        nextMonthBtn: document.getElementById('next-month'),
        categoryList: document.getElementById('category-list'),
        suggestionList: document.getElementById('suggestion-list'),
        selectedDateDisplay: document.getElementById('selected-date-display'),
        selectedCategoryDisplay: document.getElementById('selected-category-display'),
        taskList: document.getElementById('task-list'),
        newTaskInput: document.getElementById('new-task-input'),
        newTaskCategorySelect: document.getElementById('new-task-category'),
        newTaskTimeInput: document.getElementById('new-task-time'),
        addTaskBtn: document.getElementById('add-task-btn'),
        notificationBanner: document.getElementById('notification-banner'),
        enableNotificationsBtn: document.getElementById('enable-notifications-btn')
    };

    // --- Mobile Sidebar Logic ---
    const toggleSidebar = () => {
        elements.sidebar.classList.toggle('hidden');
        elements.overlay.classList.toggle('hidden');
    };

    elements.menuToggleBtn.addEventListener('click', toggleSidebar);
    if(elements.closeSidebarBtn) elements.closeSidebarBtn.addEventListener('click', toggleSidebar);
    elements.overlay.addEventListener('click', toggleSidebar);

    // --- Notifications & Reminders ---
    const checkNotificationPermission = () => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            elements.notificationBanner.classList.remove('hidden');
        } else {
            elements.notificationBanner.classList.add('hidden');
        }
    };

    elements.enableNotificationsBtn.addEventListener('click', () => {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                elements.notificationBanner.classList.add('hidden');
                new Notification('Bampot OS', { body: 'Reminders active!' });
            }
        });
    });

    const checkReminders = () => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const todayStr = formatDate(now);

        state.tasks.forEach(task => {
            if (!task.completed && task.date === todayStr && task.time === currentTime && !task.reminderSent) {
                new Notification('Task Reminder', { body: task.title, icon: '/icon-192.png' });
                task.reminderSent = true;
                saveState();
            }
        });
    };
    setInterval(checkReminders, 60000);

    // --- Bampot OS Templates ---
    const loadDailyDefaults = () => {
        const todayStr = formatDate(new Date());
        if (state.initializedDates.includes(todayStr)) return;

        const defaultTasks = [
            { title: "Drink water", cat: "minimum" },
            { title: "Eat something", cat: "minimum" },
            { title: "Throw away 10 things", cat: "minimum" },
            { title: "Take trash outside", cat: "minimum" },
            { title: "Do 5-10 minutes of Bampot work", cat: "minimum" },
            { title: "Open blinds / sunlight", cat: "daily" },
            { title: "Brush teeth", cat: "daily" },
            { title: "Put on real clothes", cat: "daily" },
            { title: "Deep Work Block (45-90m)", cat: "daily" },
            { title: "Main Quest: Pick one big task", cat: "quests" }
        ];

        defaultTasks.forEach(task => {
            const exists = state.tasks.some(t => t.title === task.title && t.date === todayStr);
            if (!exists) {
                state.tasks.push({
                    id: crypto.randomUUID(),
                    title: task.title,
                    categoryId: task.cat,
                    date: todayStr,
                    time: null,
                    completed: false,
                    priority: 0,
                    reminderSent: false
                });
            }
        });

        state.initializedDates.push(todayStr);
        saveState();
    };

    // --- Task Rollover Logic ---
    const checkAndRolloverTasks = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDate(today);

        const overdueTasks = state.tasks.filter(t => !t.completed && new Date(t.date + 'T00:00:00') < today);

        overdueTasks.forEach(task => {
            const alreadyRolled = state.tasks.some(t =>
                t.title.toLowerCase() === task.title.toLowerCase() && t.categoryId === task.categoryId && t.date === todayStr
            );

            if (!alreadyRolled) {
                const taskDate = new Date(task.date + 'T00:00:00');
                const daysOverdue = Math.ceil(Math.abs(today - taskDate) / (1000 * 60 * 60 * 24));
                const newPriority = (task.priority || 0) + daysOverdue;

                state.tasks.push({
                    id: crypto.randomUUID(),
                    title: task.title,
                    categoryId: task.categoryId,
                    date: todayStr,
                    time: task.time,
                    completed: false,
                    priority: newPriority,
                    daysOverdue: daysOverdue,
                    reminderSent: false
                });

                task.completed = true; // Complete old instance to avoid duplicate rollovers
                task.rolloverStatus = 'rolled-over';
            }
        });
        saveState();
    };

    // --- Core Logic & Rendering ---
    const renderCalendar = () => {
        elements.calendarGrid.innerHTML = '';
        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        elements.monthYearDisplay.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(state.currentDate);

        for (let i = 0; i < firstDay; i++) {
            elements.calendarGrid.innerHTML += `<div class="calendar-day empty"></div>`;
        }

        const todayStr = formatDate(new Date());
        const selectedStr = formatDate(state.selectedDate);

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = i;

            const currentDayStr = formatDate(new Date(year, month, i));
            if (currentDayStr === todayStr) dayDiv.classList.add('today');
            if (currentDayStr === selectedStr) dayDiv.classList.add('selected');
            if (state.tasks.some(t => t.date === currentDayStr)) dayDiv.classList.add('has-tasks');

            dayDiv.addEventListener('click', () => {
                state.selectedDate = new Date(year, month, i);
                if(window.innerWidth < 769) toggleSidebar(); // auto close on mobile
                updateViews();
            });

            elements.calendarGrid.appendChild(dayDiv);
        }
    };

    elements.prevMonthBtn.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); renderCalendar(); });
    elements.nextMonthBtn.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); renderCalendar(); });

    const renderCategories = () => {
        elements.categoryList.innerHTML = '';
        const shouldPopulateSelect = elements.newTaskCategorySelect.options.length === 0;

        state.categories.forEach(cat => {
            const li = document.createElement('li');
            li.className = `filter-item ${state.selectedCategory === cat.id ? 'active' : ''}`;
            li.innerHTML = `
                <i class="fas ${cat.icon}" style="color: ${cat.color}; width: 20px; text-align: center;"></i>
                <span>${cat.name}</span>
            `;
            li.addEventListener('click', () => {
                state.selectedCategory = cat.id;
                if(window.innerWidth < 769) toggleSidebar(); // auto close on mobile
                updateViews();
            });
            elements.categoryList.appendChild(li);

            if (shouldPopulateSelect && cat.id !== 'all') {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                elements.newTaskCategorySelect.appendChild(option);
            }
        });
    };

    const renderSuggestions = () => {
        elements.suggestionList.innerHTML = '';
        const todayStr = formatDate(new Date());

        const completedPastTasks = state.tasks.filter(t => t.completed && t.date !== todayStr);
        const freqs = {};
        completedPastTasks.forEach(t => {
            if (!freqs[t.title]) freqs[t.title] = { count: 0, cat: t.categoryId };
            freqs[t.title].count++;
        });

        const suggestions = Object.keys(freqs)
            .filter(title => !state.tasks.some(t => t.title.toLowerCase() === title.toLowerCase() && t.date === todayStr) && freqs[title].count >= 2)
            .map(title => ({ title, categoryId: freqs[title].cat }))
            .slice(0, 3);

        if (suggestions.length === 0) {
            elements.suggestionList.innerHTML = '<li class="text-muted" style="padding: 10px; font-size: 0.85rem;">Do more tasks to unlock smart suggestions.</li>';
            return;
        }

        suggestions.forEach(sugg => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';

            const titleSpan = document.createElement('span');
            titleSpan.textContent = sugg.title;

            const addBtn = document.createElement('button');
            addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
            addBtn.addEventListener('click', () => {
                state.tasks.push({
                    id: crypto.randomUUID(),
                    title: sugg.title,
                    categoryId: sugg.categoryId,
                    date: todayStr,
                    time: null,
                    completed: false,
                    priority: 0,
                    reminderSent: false
                });
                saveState();
                updateViews();
            });

            li.appendChild(titleSpan);
            li.appendChild(addBtn);
            elements.suggestionList.appendChild(li);
        });
    };

    const renderTasks = () => {
        elements.taskList.innerHTML = '';
        const selectedDateStr = formatDate(state.selectedDate);

        // Update header displays
        elements.selectedDateDisplay.textContent = selectedDateStr === formatDate(new Date()) ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(state.selectedDate);
        const catObj = state.categories.find(c => c.id === state.selectedCategory);
        elements.selectedCategoryDisplay.textContent = catObj ? catObj.name : 'All Categories';

        let filteredTasks = state.tasks.filter(t => t.date === selectedDateStr && (state.selectedCategory === 'all' || t.categoryId === state.selectedCategory));

        filteredTasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return (b.priority || 0) - (a.priority || 0);
        });

        if (filteredTasks.length === 0) {
            elements.taskList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>All caught up</h3>
                    <p>No tasks found for this view.</p>
                </div>
            `;
            return;
        }

        filteredTasks.forEach(task => {
            const category = state.categories.find(c => c.id === task.categoryId);
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;

            // Checkbox
            const checkWrapper = document.createElement('label');
            checkWrapper.className = 'checkbox-wrapper';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.completed;
            const checkmark = document.createElement('span');
            checkmark.className = 'checkmark';
            checkWrapper.append(checkbox, checkmark);

            // Content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'task-content';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'task-title';
            titleSpan.textContent = task.title;

            const badgesDiv = document.createElement('div');
            badgesDiv.className = 'task-badges';

            const catBadge = document.createElement('span');
            catBadge.className = 'badge badge-cat';
            catBadge.style.backgroundColor = category.color;
            catBadge.textContent = category.name;
            badgesDiv.appendChild(catBadge);

            if (task.time) {
                const timeBadge = document.createElement('span');
                timeBadge.className = 'badge badge-time';
                timeBadge.innerHTML = `<i class="far fa-clock"></i> ${task.time}`;
                badgesDiv.appendChild(timeBadge);
            }

            if (task.priority > 0 && !task.completed) {
                const prioBadge = document.createElement('span');
                prioBadge.className = `badge badge-priority ${task.priority > 3 ? 'high' : ''}`;
                prioBadge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Prio: ${task.priority} (${task.daysOverdue}d late)`;
                badgesDiv.appendChild(prioBadge);
            }

            contentDiv.append(titleSpan, badgesDiv);

            // Actions
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'task-actions';

            const btnBreakdown = document.createElement('button');
            btnBreakdown.className = 'btn-breakdown';
            btnBreakdown.innerHTML = '<i class="fas fa-bolt"></i>';

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-delete';
            btnDelete.innerHTML = '<i class="fas fa-trash"></i>';

            actionsDiv.append(btnBreakdown, btnDelete);
            li.append(checkWrapper, contentDiv, actionsDiv);

            // Events
            checkbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                state.tasks.forEach(t => {
                    if (t.title.toLowerCase() === task.title.toLowerCase()) {
                        if (!isChecked && t.rolloverStatus === 'rolled-over') return;
                        t.completed = isChecked;
                    }
                });
                saveState();
                renderTasks();
            });

            btnBreakdown.addEventListener('click', async () => {
                const btnIcon = btnBreakdown.querySelector('i');
                btnIcon.className = "fas fa-spinner fa-spin";
                btnBreakdown.disabled = true;
                li.style.opacity = "0.7";

                try {
                    const generator = await getAiModel();
                    const prompt = `Break down the task "${task.title}" into 3 to 5 simple, actionable sub-steps. Output each step clearly on a new line.`;

                    const result = await generator(prompt, {
                        max_new_tokens: 100,
                        temperature: 0.6,
                        do_sample: true
                    });

                    const outputText = result[0].generated_text;
                    const splitRegex = outputText.includes('\n') ? /\n/ : /(?<=\.)\s+/;
                    let subs = outputText.split(splitRegex)
                        .map(line => line.replace(/^[\d\.\-\*\s]+/, '').trim())
                        .filter(line => line.length > 2);

                    if (subs.length === 0) {
                        subs = ["Prep", "Execute", "Review"]; // Fallback
                    }

                    subs.forEach(s => state.tasks.push({
                        id: crypto.randomUUID(),
                        title: `${s} (${task.title})`,
                        categoryId: task.categoryId,
                        date: task.date,
                        time: task.time,
                        completed: false,
                        priority: task.priority,
                        reminderSent: task.reminderSent
                    }));

                    state.tasks = state.tasks.filter(t => t.id !== task.id); // Remove original task
                    saveState();
                    updateViews();
                } catch (err) {
                    console.error("AI Breakdown failed", err);
                    alert("Failed to breakdown task. Check console.");
                    btnIcon.className = "fas fa-bolt";
                    btnBreakdown.disabled = false;
                    li.style.opacity = "1";
                }
            });

            btnDelete.addEventListener('click', () => {
                state.tasks = state.tasks.filter(t => t.id !== task.id);
                saveState();
                updateViews();
            });

            elements.taskList.appendChild(li);
        });
    };

    const updateViews = () => {
        renderCalendar();
        renderCategories();
        renderSuggestions();
        renderTasks();
    };

    elements.addTaskBtn.addEventListener('click', () => {
        const title = elements.newTaskInput.value.trim();
        if (!title) return;

        const existing = state.tasks.find(t => t.title.toLowerCase() === title.toLowerCase());

        state.tasks.push({
            id: crypto.randomUUID(),
            title: title,
            categoryId: elements.newTaskCategorySelect.value,
            date: formatDate(state.selectedDate),
            time: elements.newTaskTimeInput.value || null,
            completed: existing ? existing.completed : false,
            priority: 0,
            reminderSent: false
        });

        elements.newTaskInput.value = '';
        elements.newTaskTimeInput.value = '';
        saveState();
        updateViews();
    });

    elements.newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') elements.addTaskBtn.click(); });

    // --- Local AI Logic ---
    let aiGenerator = null;
    let isAiLoading = false;

    const getAiModel = async () => {
        if (aiGenerator) return aiGenerator;

        isAiLoading = true;
        elements.aiStatus.classList.remove('hidden');
        elements.runAiBtn.disabled = true;
        elements.aiStatusText.innerText = "Downloading Local AI Model (~77MB)... This only happens once.";
        elements.aiProgress.style.width = "0%";

        try {
            aiGenerator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M', {
                progress_callback: (info) => {
                    if (info.status === 'progress') {
                        const progress = (info.loaded / info.total) * 100 || 0;
                        elements.aiProgress.style.width = `${progress}%`;
                        elements.aiStatusText.innerText = `Downloading Model: ${Math.round(progress)}%`;
                    }
                }
            });
            elements.aiStatusText.innerText = "Model loaded successfully!";
            elements.aiProgress.style.width = "100%";
            setTimeout(() => {
                if(!isAiLoading) elements.aiStatus.classList.add('hidden');
            }, 2000);
            return aiGenerator;
        } catch (err) {
            console.error("AI Model Load Error:", err);
            elements.aiStatusText.innerText = "Failed to load AI model.";
            elements.aiStatusText.style.color = "#ef4444";
            throw err;
        } finally {
            isAiLoading = false;
            elements.runAiBtn.disabled = false;
        }
    };

    const generateAiTasks = async () => {
        const prompt = elements.aiPromptInput.value.trim();
        if (!prompt) return;

        elements.aiStatus.classList.remove('hidden');
        elements.aiProgress.style.width = "0%";
        elements.aiStatusText.innerText = "Initializing AI...";
        elements.runAiBtn.disabled = true;
        elements.runAiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';

        try {
            const generator = await getAiModel();
            elements.aiStatusText.innerText = "Thinking...";
            elements.aiProgress.style.width = "50%";

            // Gather context of unfinished tasks
            const unfinishedTasks = state.tasks
                .filter(t => !t.completed && t.date <= formatDate(state.selectedDate))
                .map(t => t.title)
                .join(', ');

            let contextStr = unfinishedTasks ? ` Currently pending tasks: ${unfinishedTasks}.` : "";

            // Frame the prompt for Flan-T5 to act as an executive assistant
            const structuredPrompt = `You are an executive assistant. Based on the following goal: "${prompt}", and considering these pending tasks: [${unfinishedTasks}], generate a step-by-step prioritized checklist for today. List each step clearly on a new line.`;

            const result = await generator(structuredPrompt, {
                max_new_tokens: 150,
                temperature: 0.7,
                do_sample: true
            });

            const outputText = result[0].generated_text;

            // Parse the output: Split by newlines or punctuation if it generated a paragraph, remove numbers, bullet points, and trim
            const splitRegex = outputText.includes('\n') ? /\n/ : /(?<=\.)\s+/;
            const newTasks = outputText.split(splitRegex)
                .map(line => line.replace(/^[\d\.\-\*\s]+/, '').trim())
                .filter(line => line.length > 2);

            if (newTasks.length === 0) {
                // Fallback if parsing fails
                newTasks.push(outputText.trim());
            }

            const targetCategoryId = elements.newTaskCategorySelect.value || 'all';
            const targetDateStr = formatDate(state.selectedDate);

            newTasks.forEach(title => {
                window.appState.tasks.push({
                    id: crypto.randomUUID(),
                    title: title,
                    categoryId: targetCategoryId === 'all' ? window.appState.categories[1].id : targetCategoryId,
                    date: targetDateStr,
                    time: null,
                    completed: false,
                    priority: 0,
                    reminderSent: false
                });
            });

            saveState();
            updateViews();

            // Close modal
            elements.aiModalOverlay.classList.add('hidden');
            elements.aiPromptInput.value = '';

        } catch (error) {
            console.error(error);
            alert("AI Generation failed. Check console.");
        } finally {
            elements.runAiBtn.disabled = false;
            elements.runAiBtn.innerHTML = '<i class="fas fa-bolt"></i> Generate';
            elements.aiStatus.classList.add('hidden');
        }
    };

    // AI Event Listeners
    if (elements.openAiModalBtn) {
        elements.openAiModalBtn.addEventListener('click', () => {
            elements.aiModalOverlay.classList.remove('hidden');
            elements.aiPromptInput.focus();
        });
    }

    if (elements.cancelAiBtn) {
        elements.cancelAiBtn.addEventListener('click', () => {
            elements.aiModalOverlay.classList.add('hidden');
        });
    }

    if (elements.runAiBtn) {
        elements.runAiBtn.addEventListener('click', generateAiTasks);
    }

    // Boot
    checkNotificationPermission();
    loadDailyDefaults();
    checkAndRolloverTasks();
    updateViews();
});
