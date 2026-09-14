import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, GripVertical, ListChecks, Pencil, Plus } from 'lucide-react';
import type { HabitStore } from '@/lib/habitStore';
import {
  addDays,
  describeFrequency,
  formatPercent,
  iconFor,
  startOfDay,
  statsFor,
  type Habit,
} from '@/lib/habits';
import { Card, CardHeader, Chip, Empty, GhostButton, PrimaryButton } from './ui';

/**
 * Every habit, in the order they appear on Today — and the page where that
 * order is decided. Reordering lives here rather than on Today because
 * dragging a row and ticking a row are different intentions, and a list that
 * does both makes a tick that starts with a 2px wobble into a reorder.
 */
export function HabitsPage({
  store,
  onAdd,
  onEdit,
  onOpen,
}: {
  store: HabitStore;
  onAdd: () => void;
  onEdit: (habit: Habit) => void;
  onOpen: (habit: Habit) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);

  /**
   * The order being dragged, or null when nothing is. Held apart from the
   * store so the list can follow the cursor at 60fps without a write per
   * pixel — the store hears about it once, on drop.
   */
  const [order, setOrder] = useState<string[] | null>(null);
  const draggingId = useRef<string | null>(null);

  const habits = useMemo(() => {
    if (!order) return store.habits;
    const byId = new Map(store.habits.map((habit) => [habit.id, habit]));
    // Filtered, not asserted: a habit deleted in another tab mid-drag should
    // drop out of the list rather than crash it.
    return order.map((id) => byId.get(id)).filter((habit): habit is Habit => Boolean(habit));
  }, [order, store.habits]);

  // A drag that ends outside the list never fires `drop`. Without this the
  // preview order would stick around, silently diverging from what was saved.
  useEffect(() => {
    const onDragEnd = () => {
      if (draggingId.current === null) return;
      draggingId.current = null;
      setOrder(null);
    };
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, []);

  const startDrag = (id: string) => {
    draggingId.current = id;
    setOrder(store.habits.map((habit) => habit.id));
  };

  /** Moves the dragged habit to `index` in the live preview. */
  const moveTo = (index: number) => {
    const id = draggingId.current;
    if (id === null) return;
    setOrder((prev) => {
      const current = prev ?? store.habits.map((habit) => habit.id);
      const from = current.indexOf(id);
      if (from === -1 || from === index) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(index, 0, id);
      return next;
    });
  };

  const commit = () => {
    const pending = order;
    draggingId.current = null;
    setOrder(null);
    if (!pending) return;
    const unchanged = pending.every((id, i) => store.habits[i]?.id === id);
    if (!unchanged) store.reorder(pending);
  };

  /** Keyboard equivalent of a drag, for anyone not using a mouse. */
  const nudge = (id: string, direction: -1 | 1) => {
    const ids = store.habits.map((habit) => habit.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    store.reorder(next);
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-clay-900">Habits</h1>
          <p className="mt-1 text-sm text-clay-500">
            Drag to reorder. This is the order Today shows them in.
          </p>
        </div>
        <PrimaryButton onClick={onAdd}>
          <Plus className="h-4 w-4" />
          New habit
        </PrimaryButton>
      </header>

      <Card className="mt-6">
        <CardHeader
          title={`${store.habits.length} ${store.habits.length === 1 ? 'habit' : 'habits'}`}
          hint="Rates and streaks are from the last 30 days."
        />

        {store.habits.length === 0 ? (
          <Empty
            icon={<ListChecks className="h-5 w-5" />}
            title="No habits yet"
            message="Habits you add show up here, in whatever order you put them."
            action={
              <PrimaryButton onClick={onAdd}>
                <Plus className="h-4 w-4" />
                Add a habit
              </PrimaryButton>
            }
          />
        ) : (
          <ul
            className="divide-y divide-clay-200/70"
            // The list, not each row, owns the drop: a cursor between two rows
            // is still inside the list and should not cancel the drag.
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            {habits.map((habit, index) => (
              <li
                key={habit.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox refuses to start a drag without payload.
                  e.dataTransfer.setData('text/plain', habit.id);
                  startDrag(habit.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  moveTo(index);
                }}
                className={`transition-opacity ${
                  draggingId.current === habit.id ? 'opacity-40' : ''
                }`}
              >
                <HabitListRow
                  habit={habit}
                  today={today}
                  entries={store.entries}
                  onEdit={() => onEdit(habit)}
                  onOpen={() => onOpen(habit)}
                  onNudge={(direction) => nudge(habit.id, direction)}
                  position={index + 1}
                  total={habits.length}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function HabitListRow({
  habit,
  today,
  entries,
  onEdit,
  onOpen,
  onNudge,
  position,
  total,
}: {
  habit: Habit;
  today: Date;
  entries: HabitStore['entries'];
  onEdit: () => void;
  onOpen: () => void;
  onNudge: (direction: -1 | 1) => void;
  position: number;
  total: number;
}) {
  const Icon = iconFor(habit.icon);
  const stats = useMemo(
    () => statsFor(habit, entries, addDays(today, -29), today),
    [habit, entries, today]
  );

  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-clay-50/70">
      <span
        // The whole row is draggable, but the handle is what says so — and it
        // is focusable, so the same move can be made with the arrow keys.
        tabIndex={0}
        role="button"
        aria-label={`Reorder ${habit.name}. Position ${position} of ${total}. Use the arrow keys.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onNudge(-1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            onNudge(1);
          }
        }}
        className="cursor-grab rounded-lg p-1 text-clay-300 transition-colors hover:text-clay-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-300 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </span>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
        title={`Open ${habit.name}`}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${habit.color}1f`, color: habit.color }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-clay-900">{habit.name}</span>
          <span className="mt-0.5 block truncate text-xs text-clay-400">
            {describeFrequency(habit.frequency)}
          </span>
        </span>
      </button>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <Chip>{formatPercent(stats.rate)} kept</Chip>
        {stats.currentStreak > 1 && (
          <Chip className="border-done-100 bg-done-50 text-done-700">
            <Flame className="h-3 w-3" />
            {stats.currentStreak}
          </Chip>
        )}
      </div>

      {/* Hidden until the row is hovered or something in it has focus, so the
          list reads as habits rather than as a column of buttons. */}
      <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <GhostButton onClick={onEdit} title={`Edit ${habit.name}`}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </GhostButton>
      </div>
    </div>
  );
}
