import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  supabase,
  type PlannerBlock,
  type BlockDraft,
  type PlannerRecord,
  type RecentColor,
} from '@/lib/supabase';
import {
  HOURS,
  HOUR_HEIGHT,
  SLOT_HEIGHT,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  MINUTES_PER_DAY,
  GUTTER_WIDTH,
  HEADER_HEIGHT,
  PALETTE,
  TEXT_PALETTE,
  DEFAULT_TEXT_COLOR,
  RECENT_COLOR_LIMIT,
  MIN_DAY_COLUMN_WIDTH,
  dayIndexOf,
  dayLabelsFor,
  isWeekBased,
  msUntilNextMidnight,
  summarizeDays,
  type ColorKind,
  type DayLabel,
} from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { describeDbError } from '@/lib/errors';
import type { PlannerStore } from '@/lib/planners';
import type { PeopleStore } from '@/lib/people';
import { useDayTags } from '@/lib/dayTags';
import { DayTagMenu } from './DayTagMenu';
import { EditPanel } from './EditPanel';
import { PeopleAvatars } from './People';
import { NewPlannerButton, PlannerSwitcher } from './PlannerSwitcher';
import { CalendarDays, Loader2, LogOut, Plus, Repeat, Trash2, X } from 'lucide-react';

/** A drag in progress: an anchor cell plus wherever the pointer is now. */
type Selection = {
  dayStart: number;
  dayEnd: number;
  slotStart: number;
  slotEnd: number;
};

type Cell = { day: number; slot: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * A drag reads as two independent axes, like Google Calendar:
 * vertical picks the time range, horizontal picks the days it repeats on.
 */
function selectionToDraft(sel: Selection): BlockDraft {
  const slotStart = Math.min(sel.slotStart, sel.slotEnd);
  const slotEnd = Math.max(sel.slotStart, sel.slotEnd) + 1;
  return {
    title: 'New block',
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    text_color: DEFAULT_TEXT_COLOR,
    start_minute: slotStart * SLOT_MINUTES,
    end_minute: Math.min(slotEnd * SLOT_MINUTES, MINUTES_PER_DAY),
    days: range(Math.min(sel.dayStart, sel.dayEnd), Math.max(sel.dayStart, sel.dayEnd)),
    people: [],
  };
}

function seriesToDraft(rows: PlannerBlock[]): BlockDraft {
  const [first] = rows;
  return {
    title: first.title,
    color: first.color,
    text_color: first.text_color ?? DEFAULT_TEXT_COLOR,
    start_minute: first.start_minute,
    end_minute: first.end_minute,
    days: rows.map((r) => r.day_start).sort((a, b) => a - b),
    // Every row of a series carries the same people; the first one speaks for all.
    people: first.people ?? [],
  };
}

/** The DB rows a draft expands to — one per day, all sharing a series id. */
function draftToRows(draft: BlockDraft, seriesId: string, userId: string, plannerId: string) {
  return draft.days.map((day) => ({
    user_id: userId,
    planner_id: plannerId,
    title: draft.title,
    color: draft.color,
    text_color: draft.text_color,
    day_start: day,
    day_end: day,
    start_minute: draft.start_minute,
    end_minute: draft.end_minute,
    people: draft.people,
    // Legacy columns, kept in sync so older readers still work.
    hour_start: Math.floor(draft.start_minute / 60),
    hour_end: Math.ceil(draft.end_minute / 60),
    series_id: seriesId,
  }));
}

type BlockLayout = { col: number; cols: number };

/**
 * Overlapping blocks cascade rather than splitting the column evenly: each one
 * is indented from the block beneath it and runs to the right edge, drawn on
 * top. The block underneath keeps its title strip visible, and — unlike equal
 * lanes — a single overlap doesn't halve the width of both blocks.
 */
const CASCADE_INDENT_PCT = 42;

/** Cap on the total indent, so the topmost block of a big pile stays usable. */
const CASCADE_MAX_TOTAL_PCT = 70;

function cascadeIndent(cols: number): number {
  if (cols <= 1) return 0;
  return Math.min(CASCADE_INDENT_PCT, CASCADE_MAX_TOTAL_PCT / (cols - 1));
}

/**
 * Splits one day's blocks into side-by-side lanes so overlapping ones stay
 * visible, the way Google Calendar does it. `col` is the lane a block sits
 * in and `cols` how many lanes its pile-up needs.
 */
function layoutDay(dayBlocks: PlannerBlock[]): Map<string, BlockLayout> {
  const layout = new Map<string, BlockLayout>();
  const sorted = [...dayBlocks].sort(
    (a, b) =>
      a.start_minute - b.start_minute || b.end_minute - a.end_minute || a.id.localeCompare(b.id)
  );

  // A cluster is a run of blocks chained together by overlap. Lane count is
  // shared across the whole cluster so the edges line up down the pile.
  let cluster: string[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const id of cluster) {
      layout.set(id, { col: layout.get(id)!.col, cols: laneEnds.length });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const block of sorted) {
    if (cluster.length > 0 && block.start_minute >= clusterEnd) closeCluster();

    // Reuse the first lane whose last block has already finished.
    let lane = laneEnds.findIndex((end) => end <= block.start_minute);
    if (lane === -1) {
      laneEnds.push(block.end_minute);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = block.end_minute;
    }

    layout.set(block.id, { col: lane, cols: 1 });
    cluster.push(block.id);
    clusterEnd = Math.max(clusterEnd, block.end_minute);
  }
  if (cluster.length > 0) closeCluster();

  return layout;
}

const COLOR_KINDS: ColorKind[] = ['block', 'text'];

/** The preset list a picker offers, so only genuinely custom colours get saved. */
const PRESETS: Record<ColorKind, readonly string[]> = {
  block: PALETTE,
  text: TEXT_PALETTE,
};

export function formatTime(min: number): string {
  const clamped = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatHour(h: number): string {
  return formatTime(h * 60);
}

/**
 * Today's weekday, 0=Mon. A tab left open overnight would otherwise keep
 * highlighting yesterday, so it re-arms itself for each midnight.
 */
function useWeekdayIndex(): number {
  const [today, setToday] = useState(() => dayIndexOf(new Date()));

  useEffect(() => {
    let timer: number;

    const schedule = () => {
      const now = new Date();
      setToday(dayIndexOf(now));
      // A minute of slack, so a timer firing a touch early doesn't land back
      // on the day that just ended and then wait a whole day to correct.
      timer = window.setTimeout(schedule, msUntilNextMidnight(now) + 60_000);
    };

    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return today;
}

/**
 * Minutes since local midnight, re-read on each minute boundary rather than on
 * a 60s interval, so the marker steps in time with the clock instead of
 * drifting up to a minute behind it.
 */
function useNowMinutes(): number {
  const [minutes, setMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    let timer: number;

    const schedule = () => {
      const now = new Date();
      setMinutes(now.getHours() * 60 + now.getMinutes());
      const msToNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timer = window.setTimeout(schedule, msToNextMinute);
    };

    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return minutes;
}

/**
 * The height of the app bar, measured rather than hardcoded: the week header
 * sticks directly beneath it, and the bar's height changes with the viewport
 * (the hint pill and email only appear at wider breakpoints).
 */
function useElementHeight<T extends HTMLElement>(ref: React.RefObject<T | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}

/**
 * One planner's week. Mounted keyed on `plannerId`, so switching planners
 * throws this state away and reloads rather than merging two weeks.
 */
export function Planner({
  planner,
  plannerStore,
  peopleStore,
}: {
  planner: PlannerRecord;
  plannerStore: PlannerStore;
  peopleStore: PeopleStore;
}) {
  const { user, signOut } = useAuth();
  // Planner only renders behind the auth gate, so this is always set.
  const userId = user!.id;
  const plannerId = planner.id;
  const dayCount = planner.day_count;
  const weekdayIndex = useWeekdayIndex();
  const nowMinutes = useNowMinutes();

  // What each column is called, and whether "today" means anything here: a
  // ten-day planner has no Monday to highlight.
  const dayLabels = useMemo(() => dayLabelsFor(dayCount), [dayCount]);
  const weeks = Math.ceil(dayCount / 7);
  const todayIndex = isWeekBased(dayCount) && weekdayIndex < dayCount ? weekdayIndex : -1;

  const dayTagStore = useDayTags(userId, plannerId);
  // Which day's tag menu is open, so its header cell can outrank the cells
  // beside it while the menu overhangs them.
  const [openTagDay, setOpenTagDay] = useState<number | null>(null);

  const [blocks, setBlocks] = useState<PlannerBlock[]>([]);
  const [recentColors, setRecentColors] = useState<Record<ColorKind, string[]>>({
    block: [],
    text: [],
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const appBarRef = useRef<HTMLElement>(null);
  const appBarHeight = useElementHeight(appBarRef);
  const dragAnchorRef = useRef<Cell | null>(null);
  // A press that begins on an existing block is ambiguous: it opens that
  // block on a click, but draws a new overlapping one if the pointer moves.
  const startedOnBlockRef = useRef(false);
  const suppressBlockClickRef = useRef(false);

  const fetchBlocks = useCallback(async () => {
    const { data, error } = await supabase
      .from('planner_blocks')
      .select('*')
      .eq('planner_id', plannerId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load blocks', error);
      setDbError(describeDbError('load blocks', error));
      return;
    }
    setBlocks(data ?? []);
  }, [plannerId]);

  /** Reads the recent colours newest-first and trims anything past the limit. */
  const fetchRecentColors = useCallback(async () => {
    const { data, error } = await supabase
      .from('recent_colors')
      .select('*')
      .order('used_at', { ascending: false });
    if (error) {
      console.error('Failed to load recent colors', error);
      setDbError(describeDbError('load recent colors', error));
      return;
    }

    const byKind: Record<ColorKind, string[]> = { block: [], text: [] };
    for (const row of (data ?? []) as RecentColor[]) {
      if (COLOR_KINDS.includes(row.kind)) byKind[row.kind].push(row.color);
    }

    setRecentColors({
      block: byKind.block.slice(0, RECENT_COLOR_LIMIT),
      text: byKind.text.slice(0, RECENT_COLOR_LIMIT),
    });

    // Drop the overflow so the table stays at five per picker.
    const stale = COLOR_KINDS.map((kind) => ({
      kind,
      colors: byKind[kind].slice(RECENT_COLOR_LIMIT),
    })).filter((entry) => entry.colors.length > 0);

    await Promise.all(
      stale.map((entry) =>
        supabase
          .from('recent_colors')
          .delete()
          .eq('user_id', userId)
          .eq('kind', entry.kind)
          .in('color', entry.colors)
      )
    );
  }, [userId]);

  useEffect(() => {
    // Day tags load themselves; these two are what the grid draws.
    Promise.all([fetchBlocks(), fetchRecentColors()]);
  }, [fetchBlocks, fetchRecentColors]);

  /** Records any colour the user typed in rather than picked from a preset. */
  const rememberColors = async (d: BlockDraft) => {
    const usedAt = new Date().toISOString();
    const rows = [
      { kind: 'block' as ColorKind, color: d.color },
      { kind: 'text' as ColorKind, color: d.text_color },
    ]
      .filter((row) => !PRESETS[row.kind].includes(row.color))
      .map((row) => ({ ...row, user_id: userId, used_at: usedAt }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('recent_colors')
      .upsert(rows, { onConflict: 'user_id,kind,color' });
    if (error) {
      // A colour failing to stick shouldn't disturb a block that saved fine.
      console.error('Failed to save recent colors', error);
      return;
    }
    await fetchRecentColors();
  };

  // --- Dragging -------------------------------------------------------------
  // Capture is taken on the grid container, not the cell under the pointer.
  // Capturing on the cell would route every later pointer event back to that
  // one cell, so the drag could never grow past where it started.

  const cellFromPoint = (clientX: number, clientY: number): Cell | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dayWidth = (rect.width - GUTTER_WIDTH) / dayCount;
    return {
      day: clamp(Math.floor((clientX - rect.left - GUTTER_WIDTH) / dayWidth), 0, dayCount - 1),
      slot: clamp(
        Math.floor((clientY - rect.top - HEADER_HEIGHT) / SLOT_HEIGHT),
        0,
        SLOTS_PER_DAY - 1
      ),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || draft || editingSeriesId) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-header]')) return;

    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Ignore the header row and the time gutter.
    if (e.clientY - rect.top < HEADER_HEIGHT || e.clientX - rect.left < GUTTER_WIDTH) return;

    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    dragAnchorRef.current = cell;
    startedOnBlockRef.current = target.closest('[data-block]') !== null;

    if (startedOnBlockRef.current) {
      // Hold off on everything: this may still be a plain click that opens the
      // block. Capturing here would retarget the follow-up click to the grid,
      // and preventDefault would stop it being generated at all — either way
      // the block's own onClick would never run.
      setSelection(null);
      return;
    }

    e.preventDefault();
    setSelection({
      dayStart: cell.day,
      dayEnd: cell.day,
      slotStart: cell.slot,
      slotEnd: cell.slot,
    });
    gridRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    // A press that began on a block only becomes a drag once it leaves the
    // cell it started in. That's the point capture becomes safe to take, and
    // it's needed from here on so the drag survives leaving the grid.
    if (startedOnBlockRef.current && !selection) {
      if (cell.day === anchor.day && cell.slot === anchor.slot) return;
      gridRef.current?.setPointerCapture(e.pointerId);
    }

    setSelection({
      dayStart: anchor.day,
      dayEnd: cell.day,
      slotStart: anchor.slot,
      slotEnd: cell.slot,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (gridRef.current?.hasPointerCapture(e.pointerId)) {
      gridRef.current.releasePointerCapture(e.pointerId);
    }
    const draggedFromBlock = startedOnBlockRef.current;
    dragAnchorRef.current = null;
    startedOnBlockRef.current = false;

    if (!selection) return;

    const newDraft = selectionToDraft(selection);
    setSelection(null);

    if (draggedFromBlock) {
      // The click event still follows this pointerup; swallow it so the
      // block underneath doesn't open on top of the new draft.
      suppressBlockClickRef.current = true;
      setTimeout(() => {
        suppressBlockClickRef.current = false;
      }, 0);
    }
    setDraft(newDraft);
  };

  const handlePointerCancel = () => {
    dragAnchorRef.current = null;
    startedOnBlockRef.current = false;
    setSelection(null);
  };

  // --- Persistence ----------------------------------------------------------

  const saveDraft = async (d: BlockDraft) => {
    setDbError(null);
    const { data, error } = await supabase
      .from('planner_blocks')
      .insert(draftToRows(d, crypto.randomUUID(), userId, plannerId))
      .select();
    if (error) {
      console.error('Failed to save block', error);
      setDbError(describeDbError('save block', error));
      return;
    }
    setBlocks((prev) => [...prev, ...(data ?? [])]);
    setDraft(null);
    await rememberColors(d);
  };

  /**
   * Reconciles a series against the edited draft: days that stay are updated,
   * days that were added get new rows, days that were dropped are deleted.
   */
  const updateSeries = async (seriesId: string, d: BlockDraft) => {
    setDbError(null);

    const current = blocks.filter((b) => b.series_id === seriesId);
    const nextDays = new Set(d.days);
    const currentDays = new Set(current.map((b) => b.day_start));

    const staleIds = current.filter((b) => !nextDays.has(b.day_start)).map((b) => b.id);
    const keptIds = current.filter((b) => nextDays.has(b.day_start)).map((b) => b.id);
    const addedDays = d.days.filter((day) => !currentDays.has(day));

    const fields = {
      title: d.title,
      color: d.color,
      text_color: d.text_color,
      start_minute: d.start_minute,
      end_minute: d.end_minute,
      people: d.people,
      hour_start: Math.floor(d.start_minute / 60),
      hour_end: Math.ceil(d.end_minute / 60),
    };

    const results = await Promise.all([
      staleIds.length
        ? supabase.from('planner_blocks').delete().in('id', staleIds)
        : Promise.resolve({ error: null }),
      keptIds.length
        ? supabase.from('planner_blocks').update(fields).in('id', keptIds)
        : Promise.resolve({ error: null }),
      addedDays.length
        ? supabase
            .from('planner_blocks')
            .insert(draftToRows({ ...d, days: addedDays }, seriesId, userId, plannerId))
        : Promise.resolve({ error: null }),
    ]);

    const failure = results.find((r) => r.error);
    if (failure?.error) {
      console.error('Failed to update block', failure.error);
      setDbError(describeDbError('update block', failure.error));
    }

    // Three writes touched the series; re-read rather than patch it by hand.
    await fetchBlocks();
    setEditingSeriesId(null);
    await rememberColors(d);
  };

  const deleteSeries = async (seriesId: string) => {
    setDbError(null);
    const { error } = await supabase.from('planner_blocks').delete().eq('series_id', seriesId);
    if (error) {
      console.error('Failed to delete block', error);
      setDbError(describeDbError('delete block', error));
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.series_id !== seriesId));
    setEditingSeriesId(null);
  };

  /**
   * Deletes every block in this planner's week. Day tags are left alone, and
   * the account's other planners are untouched.
   */
  const clearWeek = async () => {
    setClearing(true);
    setDbError(null);
    const { error } = await supabase.from('planner_blocks').delete().eq('planner_id', plannerId);
    setClearing(false);
    if (error) {
      console.error('Failed to clear the week', error);
      setDbError(describeDbError('clear the week', error));
      return;
    }
    setBlocks([]);
    setDraft(null);
    setEditingSeriesId(null);
    setConfirmingClear(false);
  };

  // --- Derived --------------------------------------------------------------

  const editingSeries = useMemo(
    () => (editingSeriesId ? blocks.filter((b) => b.series_id === editingSeriesId) : []),
    [blocks, editingSeriesId]
  );

  const layouts = useMemo(() => {
    const all = new Map<string, BlockLayout>();
    for (let day = 0; day < dayCount; day++) {
      const dayBlocks = blocks.filter((b) => b.day_start === day);
      if (dayBlocks.length === 0) continue;
      for (const [id, entry] of layoutDay(dayBlocks)) all.set(id, entry);
    }
    return all;
  }, [blocks, dayCount]);

  const seriesSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const b of blocks) sizes.set(b.series_id, (sizes.get(b.series_id) ?? 0) + 1);
    return sizes;
  }, [blocks]);

  const activeDraft = draft ?? (editingSeries.length ? seriesToDraft(editingSeries) : null);

  const selGrid = selection
    ? {
        colStart: Math.min(selection.dayStart, selection.dayEnd) + 2,
        colEnd: Math.max(selection.dayStart, selection.dayEnd) + 3,
        rowStart: Math.min(selection.slotStart, selection.slotEnd) + 2,
        rowEnd: Math.max(selection.slotStart, selection.slotEnd) + 3,
      }
    : null;

  const selDraft = selection ? selectionToDraft(selection) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        ref={appBarRef}
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <PlannerSwitcher store={plannerStore} />
              <p className="truncate text-xs text-slate-500">
                ✨ Dodo & Marie's reusable week template ✨
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 lg:inline-flex">
              <Plus className="h-3.5 w-3.5" />
              Drag down to set the time, across to repeat it
            </div>
            <NewPlannerButton onCreate={plannerStore.create} />
            <ClearWeekButton
              blockCount={blocks.length}
              confirming={confirmingClear}
              clearing={clearing}
              onAsk={() => setConfirmingClear(true)}
              onCancel={() => setConfirmingClear(false)}
              onConfirm={clearWeek}
            />
            <span className="hidden max-w-[16ch] truncate text-xs text-slate-400 xl:inline">
              {user?.email}
            </span>
            <button
              onClick={signOut}
              title={`Sign out${user?.email ? ` (${user.email})` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-2 py-6 sm:px-6">
        {/* Whatever went wrong last, whether it was this week or the switcher. */}
        {(dbError || plannerStore.error || peopleStore.error || dayTagStore.error) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              {dbError ?? plannerStore.error ?? peopleStore.error ?? dayTagStore.error}
            </span>
            <button
              onClick={() => {
                setDbError(null);
                plannerStore.dismissError();
                peopleStore.dismissError();
                dayTagStore.dismissError();
              }}
              className="rounded p-0.5 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/*
          No overflow-hidden here: it would turn this card into the scroll
          container for the sticky header row below, which never scrolls, so
          the header would never stick. The corner cells round themselves
          instead.
        */}
        {/*
          A long planner grows past the page rather than squeezing its columns
          to nothing. The minimum width sits on the card so its border and
          corners still wrap the whole grid, and the page — not this element —
          does the sideways scrolling, which is what keeps the week header able
          to stick under the app bar.
        */}
        <div
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ minWidth: GUTTER_WIDTH + dayCount * MIN_DAY_COLUMN_WIDTH }}
        >
          {/*
            touch-pan-y, not touch-none: the grid is ~1150px tall, so touch
            users must still be able to scroll the page vertically over it.
          */}
          <div
            ref={gridRef}
            className="grid touch-pan-y select-none"
            style={{
              gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`,
              gridTemplateRows: `${HEADER_HEIGHT}px repeat(${SLOTS_PER_DAY}, ${SLOT_HEIGHT}px)`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/*
              Header row — sticks just under the app bar so the day names and
              their tags stay readable while the hours scroll past underneath.
            */}
            <div
              data-header
              className="sticky rounded-tl-2xl border-b border-slate-200 bg-slate-50"
              style={{
                gridColumn: '1',
                gridRow: '1',
                top: appBarHeight,
                zIndex: 25,
              }}
            />
            {dayLabels.map((label, idx) => {
              const isToday = idx === todayIndex;
              return (
                <div
                  key={idx}
                  data-header
                  aria-current={isToday ? 'date' : undefined}
                  className={`sticky flex flex-col items-center justify-center gap-1 border-b border-l border-slate-200 ${
                    idx === dayCount - 1 ? 'rounded-tr-2xl' : ''
                  } ${isToday ? 'bg-blue-50' : 'bg-slate-50'}`}
                  style={{
                    gridColumn: `${idx + 2}`,
                    gridRow: '1',
                    top: appBarHeight,
                    zIndex: openTagDay === idx ? 26 : 25,
                  }}
                >
                  <span className="flex items-baseline gap-1">
                    <span
                      title={isToday ? `${label.full} · today` : label.full}
                      className={`text-xs font-semibold uppercase tracking-wider sm:text-sm ${
                        isToday
                          ? 'rounded-full bg-blue-600 px-2 py-0.5 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {label.short}
                    </span>
                    {/* Which week of a longer planner this column belongs to. */}
                    {weeks > 1 && (
                      <span className="text-[9px] font-semibold text-slate-400">W{label.week}</span>
                    )}
                  </span>
                  <DayTagMenu
                    day={idx}
                    dayLabel={label.full}
                    store={dayTagStore}
                    onOpenChange={(open) => setOpenTagDay(open ? idx : null)}
                  />
                </div>
              );
            })}

            {/* Hour label + slot cells per hour row */}
            {HOURS.map((hour, idx) => (
              <HourRow
                key={hour}
                hour={hour}
                dayCount={dayCount}
                todayIndex={todayIndex}
                isLastHour={idx === HOURS.length - 1}
              />
            ))}

            {/* Current time */}
            <NowMarker minute={nowMinutes} dayIndex={todayIndex} />

            {/* Selection preview */}
            {selGrid && selDraft && (
              <div
                // Above the blocks, but under the sticky header it may scroll past.
                className="pointer-events-none z-20 m-0.5 overflow-hidden rounded-md border-2 border-blue-500 bg-blue-400/20 px-1 py-0.5"
                style={{
                  gridColumn: `${selGrid.colStart} / ${selGrid.colEnd}`,
                  gridRow: `${selGrid.rowStart} / ${selGrid.rowEnd}`,
                }}
              >
                <span className="text-[10px] font-semibold leading-tight text-blue-800">
                  {formatTime(selDraft.start_minute)} – {formatTime(selDraft.end_minute)}
                </span>
                {selDraft.days.length > 1 && (
                  <span className="ml-1 text-[10px] font-medium leading-tight text-blue-700">
                    · {selDraft.days.length} days
                  </span>
                )}
              </div>
            )}

            {/* Placed blocks */}
            {blocks.map((b) => {
              const slotStart = Math.floor(b.start_minute / SLOT_MINUTES);
              const slotEnd = Math.ceil(b.end_minute / SLOT_MINUTES);
              const isCompact = b.end_minute - b.start_minute <= 60;
              const repeatCount = seriesSizes.get(b.series_id) ?? 1;
              const { col, cols } = layouts.get(b.id) ?? { col: 0, cols: 1 };
              const leftPct = col * cascadeIndent(cols);
              // Letting a short block's label spill outside its box only works
              // when nothing is sitting beside it.
              const canOverflowLabel = isCompact && cols === 1;
              return (
                <button
                  key={b.id}
                  data-block
                  title={`${b.title} · ${formatTime(b.start_minute)} – ${formatTime(b.end_minute)}${
                    repeatCount > 1 ? ` · repeats on ${repeatCount} days` : ''
                  }`}
                  onClick={() => {
                    if (suppressBlockClickRef.current) return;
                    setEditingSeriesId(b.series_id);
                  }}
                  className={`group relative my-0.5 flex min-w-0 flex-col rounded-lg text-left shadow-sm transition-all hover:shadow-md ${
                    isCompact ? 'p-0.5' : 'p-2'
                  } ${canOverflowLabel ? 'overflow-visible' : 'overflow-hidden'} ${
                    editingSeriesId === b.series_id
                      ? 'ring-2 ring-slate-900 ring-offset-1'
                      : `hover:scale-[1.01] ${
                          // A rim against whatever it is sitting on top of.
                          col > 0 ? 'ring-2 ring-white' : ''
                        }`
                  }`}
                  style={{
                    gridColumn: `${b.day_start + 2}`,
                    gridRow: `${slotStart + 2} / ${slotEnd + 2}`,
                    // Percentages resolve against the day column. Each block
                    // runs to the right edge; the ones above are indented and
                    // stacked over it, so every title strip stays readable.
                    width: `calc(${100 - leftPct}% - 4px)`,
                    marginLeft: `calc(${leftPct}% + 2px)`,
                    zIndex: 10 + col,
                    backgroundColor: b.color,
                    color: b.text_color ?? DEFAULT_TEXT_COLOR,
                  }}
                >
                  <span
                    className={`flex items-center gap-1 truncate font-semibold leading-tight ${
                      isCompact
                        ? `absolute left-1 top-1 z-10 rounded bg-inherit px-1 text-[10px] ${
                            canOverflowLabel ? 'max-w-[calc(100%+160px)]' : 'max-w-[calc(100%-8px)]'
                          }`
                        : 'text-xs sm:text-sm'
                    }`}
                  >
                    {repeatCount > 1 && <Repeat className="h-3 w-3 shrink-0 opacity-80" />}
                    <span className="truncate">{b.title}</span>
                    {/* A compact block has no second line to put them on. */}
                    {isCompact && (
                      <PeopleAvatars ids={b.people} byId={peopleStore.byId} size="sm" />
                    )}
                  </span>
                  {!isCompact && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-tight opacity-80">
                      <span className="truncate">
                        {formatTime(b.start_minute)} – {formatTime(b.end_minute)}
                      </span>
                      <PeopleAvatars ids={b.people} byId={peopleStore.byId} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {activeDraft && (
        <EditPanel
          draft={activeDraft}
          recentColors={recentColors}
          peopleStore={peopleStore}
          dayLabels={dayLabels}
          isEditing={editingSeries.length > 0}
          onSave={(d) => (editingSeriesId ? updateSeries(editingSeriesId, d) : saveDraft(d))}
          onDelete={() => {
            if (editingSeriesId) return deleteSeries(editingSeriesId);
          }}
          onClose={() => {
            setDraft(null);
            setEditingSeriesId(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Wiping the week can't be undone, so the button asks first rather than
 * firing on a single click.
 */
function ClearWeekButton({
  blockCount,
  confirming,
  clearing,
  onAsk,
  onCancel,
  onConfirm,
}: {
  blockCount: number;
  confirming: boolean;
  clearing: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        onClick={onAsk}
        disabled={blockCount === 0}
        title={blockCount === 0 ? 'This planner is already empty' : 'Delete every block'}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:hover:text-slate-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Clear
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 py-1 pl-3 pr-1 text-xs font-medium text-red-700">
      <span className="hidden sm:inline">
        Delete all {blockCount} {blockCount === 1 ? 'block' : 'blocks'}?
      </span>
      <span className="sm:hidden">Delete all?</span>
      <button
        onClick={onConfirm}
        disabled={clearing}
        className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {clearing && <Loader2 className="h-3 w-3 animate-spin" />}
        {clearing ? 'Clearing…' : 'Clear'}
      </button>
      <button
        onClick={onCancel}
        disabled={clearing}
        className="rounded-full px-2 py-1 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * Google-Calendar-style "right now" line: a red rule across today's column with
 * a dot on its left edge, plus the time itself in the gutter. It rides in the
 * grid cell holding the current slot and is nudged down by however far into
 * that quarter-hour the clock has run, so it lands on the exact minute.
 *
 * A planner whose days aren't weekdays has no column for today, so it gets the
 * time in the gutter and no line — `dayIndex` is -1 in that case.
 */
function NowMarker({ minute, dayIndex }: { minute: number; dayIndex: number }) {
  const slot = Math.floor(minute / SLOT_MINUTES);
  const offset = ((minute % SLOT_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT;

  return (
    <>
      {/* Time readout, in the gutter beside the line */}
      <div
        aria-hidden
        className="pointer-events-none relative"
        style={{ gridColumn: '1', gridRow: `${slot + 2}`, zIndex: 22 }}
      >
        <span
          className="absolute right-1 -translate-y-1/2 rounded bg-red-500 px-1 py-px text-[10px] font-semibold leading-tight text-white shadow-sm"
          style={{ top: offset }}
        >
          {formatTime(minute)}
        </span>
      </div>

      {/* The line itself, across today */}
      {dayIndex >= 0 && (
        <div
          className="pointer-events-none relative"
          style={{
            gridColumn: `${dayIndex + 2}`,
            gridRow: `${slot + 2}`,
            zIndex: 22,
          }}
        >
          <div
            className="absolute inset-x-0 flex -translate-y-1/2 items-center"
            style={{ top: offset }}
            role="separator"
            aria-label={`Current time, ${formatTime(minute)}`}
          >
            <span className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-white" />
            <span className="h-0.5 flex-1 bg-red-500" />
          </div>
        </div>
      )}
    </>
  );
}

function HourRow({
  hour,
  dayCount,
  todayIndex,
  isLastHour,
}: {
  hour: number;
  dayCount: number;
  todayIndex: number;
  isLastHour: boolean;
}) {
  const slotsInHour = HOUR_HEIGHT / SLOT_HEIGHT; // 4
  const baseSlot = hour * slotsInHour;
  return (
    <>
      {/* Time label spans the whole hour */}
      <div
        className={`relative border-b border-slate-100 bg-slate-50/40 ${
          isLastHour ? 'rounded-bl-2xl' : ''
        }`}
        style={{
          gridColumn: '1',
          gridRow: `${baseSlot + 2} / ${baseSlot + 2 + slotsInHour}`,
        }}
      >
        <span className="absolute -top-2.5 right-2 text-[10px] font-medium text-slate-400">
          {formatHour(hour)}
        </span>
      </div>
      {/* Slot cells */}
      {Array.from({ length: dayCount }, (_, dayIdx) => (
        <SlotCells
          key={dayIdx}
          dayIdx={dayIdx}
          baseSlot={baseSlot}
          slotsInHour={slotsInHour}
          isToday={dayIdx === todayIndex}
          roundBottomRight={isLastHour && dayIdx === dayCount - 1}
        />
      ))}
    </>
  );
}

function SlotCells({
  dayIdx,
  baseSlot,
  slotsInHour,
  isToday,
  roundBottomRight,
}: {
  dayIdx: number;
  baseSlot: number;
  slotsInHour: number;
  isToday: boolean;
  roundBottomRight: boolean;
}) {
  return (
    <>
      {Array.from({ length: slotsInHour }, (_, q) => {
        const slot = baseSlot + q;
        const isHourBoundary = q === 0;
        return (
          <div
            key={slot}
            className={`relative ${isHourBoundary ? 'border-t' : ''} ${
              q < slotsInHour - 1 ? 'border-dashed' : ''
            } border-l border-slate-100 transition-colors ${
              roundBottomRight && q === slotsInHour - 1 ? 'rounded-br-2xl' : ''
            } ${isToday ? 'bg-blue-50/50 hover:bg-blue-100/60' : 'hover:bg-slate-50/70'}`}
            style={{ gridColumn: `${dayIdx + 2}`, gridRow: `${slot + 2}` }}
          >
            {!isHourBoundary && <div className="absolute left-0 top-0 h-px w-1.5 bg-slate-200" />}
          </div>
        );
      })}
    </>
  );
}
