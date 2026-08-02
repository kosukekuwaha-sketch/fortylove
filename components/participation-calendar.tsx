"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CalendarEvent = {
  id: string;
  title: string;
  location: string;
  starts_at: string;
  event_type?: string | null;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function ParticipationCalendar({ events, focusEventId }: { events: CalendarEvent[]; focusEventId?: string }) {
  const focusedEvent = events.find((event) => event.id === focusEventId);
  const initial = focusedEvent ? new Date(focusedEvent.starts_at) : events.length ? new Date(events[0].starts_at) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const previousEventIds = useRef(new Set(events.map((event) => event.id)));
  useEffect(() => {
    const focused = events.find((event) => event.id === focusEventId);
    if (focused) {
      const date = new Date(focused.starts_at);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      previousEventIds.current = new Set(events.map((event) => event.id));
      return;
    }
    const added = events.find((event) => !previousEventIds.current.has(event.id));
    if (added) {
      const date = new Date(added.starts_at);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    previousEventIds.current = new Set(events.map((event) => event.id));
  }, [events, focusEventId]);
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = dateKey(new Date(event.starts_at));
      map.set(key, [...(map.get(key) ?? []), event]);
    });
    return map;
  }, [events]);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((mondayOffset + lastDay.getDate()) / 7) * 7 }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day > 0 && day <= lastDay.getDate() ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });

  return <section className="participation-calendar">
    <div className="calendar-heading"><div><p className="eyebrow green">MY SCHEDULE</p><h2>参加日程</h2></div><div className="calendar-controls"><button type="button" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong><button type="button" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div></div>
    <div className="calendar-scroll"><div className="calendar-grid calendar-weekdays">{["月", "火", "水", "木", "金", "土", "日"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid calendar-days">{cells.map((date, index) => {
      const dayEvents = date ? eventMap.get(dateKey(date)) ?? [] : [];
      const isToday = date ? dateKey(date) === dateKey(new Date()) : false;
      return <div className={`calendar-day${!date ? " empty-day" : ""}${isToday ? " today" : ""}`} key={date?.toISOString() ?? `empty-${index}`}>
        {date && <><span className="calendar-date">{date.getDate()}</span><div className="calendar-events">{dayEvents.map((event) => <a href={`#event-${event.id}`} className={event.event_type === "tennis" ? "tennis-event" : "social-event"} key={event.id} title={`${event.title}｜${event.location}`}><span className="calendar-event-title">{event.title}</span><span className="calendar-event-location">{event.location}</span></a>)}</div></>}
      </div>;
    })}</div></div>
    {!events.length && <p className="calendar-empty">予約すると、ここに参加日程が表示されます。</p>}
  </section>;
}
