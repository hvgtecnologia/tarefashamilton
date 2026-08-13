import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Task, Project } from '../types';
import { URGENCY_CONFIG, sortTasksByTime, formatDate as formatDateISO } from '../constants';

interface CalendarViewProps {
    tasks: Task[];
    projects: Project[];
    onDayClick: (date: Date) => void;
    onTaskClick: (task: Task) => void;
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function CalendarView({ tasks, projects, onDayClick, onTaskClick }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = React.useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Get first day of month and number of days
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();

    // Get days from previous month to fill the first week
    const previousMonth = new Date(year, month, 0);
    const daysInPreviousMonth = previousMonth.getDate();

    // Generate calendar grid
    const calendarDays: (Date | null)[] = [];

    // Add days from previous month
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        calendarDays.push(new Date(year, month - 1, daysInPreviousMonth - i));
    }

    // Add days from current month
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push(new Date(year, month, i));
    }

    // Add days from next month to complete the grid
    const remainingDays = 42 - calendarDays.length; // 6 weeks * 7 days
    for (let i = 1; i <= remainingDays; i++) {
        calendarDays.push(new Date(year, month + 1, i));
    }

    // Get tasks for a specific date, ordenadas por horário (sem horário no topo)
    const getTasksForDate = (date: Date): Task[] => {
        const dateStr = formatDateISO(date);
        return sortTasksByTime(tasks.filter(task => task.scheduledDate === dateStr));
    };

    // Check if date is in current month
    const isCurrentMonth = (date: Date): boolean => {
        return date.getMonth() === month;
    };

    // Check if date is today
    const isToday = (date: Date): boolean => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    // Navigation handlers
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    return (
        <div className="h-screen flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-900">
                        {MONTHS[month]} {year}
                    </h1>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPreviousMonth}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Mês anterior"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </button>

                        <button
                            onClick={goToToday}
                            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Hoje
                        </button>

                        <button
                            onClick={goToNextMonth}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Próximo mês"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 p-6 overflow-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Days of week header - Hidden on mobile, shown on md+ */}
                    <div className="hidden md:grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                        {DAYS_OF_WEEK.map((day) => (
                            <div
                                key={day}
                                className="py-3 text-center text-sm font-semibold text-slate-600"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar days */}
                    <div className="grid grid-cols-1 md:grid-cols-7">
                        {calendarDays.map((date, index) => {
                            if (!date) return null;

                            const dayTasks = getTasksForDate(date);
                            const isInCurrentMonth = isCurrentMonth(date);
                            const isTodayDate = isToday(date);

                            return (
                                <div
                                    key={index}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDayClick(date);
                                    }}
                                    className={`
                    min-h-[100px] md:min-h-[120px] p-2 border-b border-r border-slate-200
                    hover:bg-slate-50 cursor-pointer transition-colors relative z-10
                    ${!isInCurrentMonth ? 'bg-slate-50/50' : 'bg-white'}
                    ${isTodayDate ? 'ring-2 ring-blue-500 ring-inset' : ''}
                  `}
                                >
                                    {/* Day number and Name */}
                                    <div className="flex justify-between items-start mb-1 pointer-events-none">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`
                            text-sm font-medium
                            ${!isInCurrentMonth ? 'text-slate-400' : 'text-slate-700'}
                            ${isTodayDate ? 'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs' : ''}
                          `}
                                            >
                                                {date.getDate()}
                                            </span>
                                            {/* Show Day Name on Mobile */}
                                            <span className="md:hidden text-xs font-semibold text-slate-500">
                                                {DAYS_OF_WEEK[date.getDay()]}
                                            </span>
                                        </div>

                                        {dayTasks.length > 0 && (
                                            <span className="text-xs font-medium text-slate-500">
                                                {dayTasks.length}
                                            </span>
                                        )}
                                    </div>

                                    {/* Tasks */}
                                    <div className="space-y-1">
                                        {dayTasks.slice(0, 3).map((task) => {
                                            const project = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                                            const urgencyColor = URGENCY_CONFIG[task.urgency]?.color || 'bg-slate-400';
                                            return (
                                                <button
                                                    key={task.id}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        onTaskClick(task);
                                                    }}
                                                    className="w-full flex flex-col gap-0.5 text-[10px] text-left hover:bg-slate-100 rounded px-0.5 -mx-0.5"
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <div
                                                            className={`w-1 h-1 rounded-full flex-shrink-0 ${urgencyColor}`}
                                                        />
                                                        <span className={`truncate font-medium leading-tight ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                            {task.scheduledTime ? `${task.scheduledTime} · ` : ''}{task.title}
                                                        </span>
                                                    </div>
                                                    {project && (
                                                        <span
                                                            className="text-[9px] px-1 rounded truncate w-fit max-w-full font-bold uppercase opacity-80"
                                                            style={{ backgroundColor: `${project.color}15`, color: project.color, border: `1px solid ${project.color}30` }}
                                                        >
                                                            {project.name}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {dayTasks.length > 3 && (
                                            <div className="text-xs text-slate-500 font-medium">
                                                +{dayTasks.length - 3} mais
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
