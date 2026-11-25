import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { addDays, addMonths, dayLabel, monthLabel, monthWeeks, todayIso, WEEKDAYS, weekdayIndex } from './calendar';

interface DateFieldProps {
    id: string;
    label: string;
    /** 'YYYY-MM-DD', or '' when no date is chosen. */
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    /** Id of the element explaining why the field is invalid. */
    describedBy?: string;
}

// Days look like plain text until hovered, then like the dashboard's secondary buttons.
const PLAIN_DAY = { '--bs-btn-color': 'var(--bs-body-color)', '--bs-btn-border-color': 'transparent' } as CSSProperties;
const MENU_STYLE: CSSProperties = { width: 'min(18rem, calc(100vw - 4rem))', top: '100%', left: 0 };

/**
 * A date picker that looks like the dashboard's selects. The browser's own date input
 * can't be styled, so this draws the calendar with Bootstrap classes (no Bootstrap JS).
 */
export default function DateField({ id, label, value, onChange, disabled, invalid, describedBy }: DateFieldProps) {
    const [open, setOpen] = useState(false);
    const [activeDay, setActiveDay] = useState(todayIso); // the day the arrow keys move; its month is shown
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const activeButton = useRef<HTMLButtonElement>(null);
    // The month buttons change activeDay too, but must keep the focus themselves.
    const focusActiveDay = useRef(false);
    const today = todayIso();

    useEffect(() => {
        if (open && focusActiveDay.current) activeButton.current?.focus();
        focusActiveDay.current = false;
    }, [open, activeDay]);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    const moveTo = (day: string) => {
        focusActiveDay.current = true;
        setActiveDay(day);
    };
    const openCalendar = () => {
        moveTo(value || todayIso());
        setOpen(true);
    };
    const choose = (day: string) => {
        onChange(day);
        setOpen(false);
        trigger.current?.focus();
    };

    const onDayKeyDown = (e: KeyboardEvent) => {
        const targets: Record<string, () => string> = {
            ArrowLeft: () => addDays(activeDay, -1),
            ArrowRight: () => addDays(activeDay, 1),
            ArrowUp: () => addDays(activeDay, -7),
            ArrowDown: () => addDays(activeDay, 7),
            Home: () => addDays(activeDay, -weekdayIndex(activeDay)),
            End: () => addDays(activeDay, 6 - weekdayIndex(activeDay)),
            PageUp: () => addMonths(activeDay, e.shiftKey ? -12 : -1),
            PageDown: () => addMonths(activeDay, e.shiftKey ? 12 : 1),
        };
        const target = targets[e.key];
        if (!target) return;
        e.preventDefault();
        moveTo(target());
    };

    const monthButton = (text: string, name: string, months: number) => (
        <button type="button" className="btn btn-sm btn-outline-secondary border-0" aria-label={name}
            onClick={() => setActiveDay(addMonths(activeDay, months))}>
            <span aria-hidden="true">{text}</span>
        </button>
    );

    return (
        <div
            ref={root}
            className="position-relative"
            onBlur={(e) => {
                if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
            }}
            onKeyDown={(e) => {
                if (e.key !== 'Escape' || !open) return;
                e.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
            }}
        >
            <label htmlFor={id} className="form-label">{label}</label>
            <button
                ref={trigger}
                type="button"
                id={id}
                role="combobox"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? `${id}-calendar` : undefined}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                className={`form-select text-start ${invalid ? 'is-invalid' : ''}`}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openCalendar())}
            >
                {value || 'Any date'}
            </button>
            {open && (
                <div id={`${id}-calendar`} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}
                    className="dropdown-menu show p-2 mt-1 shadow-sm" style={MENU_STYLE}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <div>
                            {monthButton('«', 'Previous year', -12)}
                            {monthButton('‹', 'Previous month', -1)}
                        </div>
                        <span className="fw-medium small" aria-live="polite">{monthLabel(activeDay)}</span>
                        <div>
                            {monthButton('›', 'Next month', 1)}
                            {monthButton('»', 'Next year', 12)}
                        </div>
                    </div>
                    <table role="grid" aria-label={monthLabel(activeDay)} className="table table-sm table-borderless text-center mb-2"
                        style={{ tableLayout: 'fixed' }}>
                        <thead>
                            <tr>
                                {WEEKDAYS.map((name) => (
                                    <th key={name} scope="col" abbr={name} className="small fw-medium text-secondary">{name.slice(0, 2)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody onKeyDown={onDayKeyDown}>
                            {monthWeeks(activeDay).map((week, index) => (
                                <tr key={index}>
                                    {week.map((day, column) => {
                                        if (!day) return <td key={column} className="p-0" />;
                                        const selected = day === value;
                                        const look = selected ? 'btn-primary'
                                            : day === today ? 'btn-outline-primary'
                                                : 'btn-outline-secondary';
                                        return (
                                            <td key={column} role="gridcell" aria-selected={selected} className="p-0">
                                                <button
                                                    ref={day === activeDay ? activeButton : undefined}
                                                    type="button"
                                                    className={`btn btn-sm w-100 px-0 ${look}`}
                                                    style={selected || day === today ? undefined : PLAIN_DAY}
                                                    tabIndex={day === activeDay ? 0 : -1}
                                                    aria-label={dayLabel(day)}
                                                    aria-current={day === today ? 'date' : undefined}
                                                    onClick={() => choose(day)}
                                                >
                                                    {Number(day.slice(8))}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="d-flex justify-content-between border-top pt-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => choose(today)}>Today</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => choose('')} disabled={!value}>Clear</button>
                    </div>
                </div>
            )}
        </div>
    );
}
