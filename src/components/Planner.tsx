import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type PlannerBlock, type BlockDraft, type DayTag } from '@/lib/supabase';
import {
  DAYS,
  HOURS,
  HOUR_HEIGHT,
  SLOT_HEIGHT,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  MINUTES_PER_DAY,
  GUTTER_WIDTH,
  HEADER_HEIGHT,
  PALETTE,
  DAY_TAG_CYCLE,
  DAY_TAG_STYLES,
  type DayTagValue,
} from '@/lib/constants';
import { EditPanel } from './EditPanel';
import { Building2, CalendarDays, House, Palmtree, Plus, Repeat, X } from 'lucide-react';

type DayTagMap = Partial<Record<number, DayTagValue>>;

const DAY_TAG_ICONS = {
  remote: House,
  office: Building2,
  free: Palmtree,
} as const;

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
    start_minute: slotStart * SLOT_MINUTES,
    end_minute: Math.min(slotEnd * SLOT_MINUTES, MINUTES_PER_DAY),
    days: range(Math.min(sel.dayStart, sel.dayEnd), Math.max(sel.dayStart, sel.dayEnd)),
  };
}

function seriesToDraft(rows: PlannerBlock[]): BlockDraft {
  const [first] = rows;
  return {
    title: first.title,
    color: first.color,
    start_minute: first.start_minute,
    end_minute: first.end_minute,
    days: rows.map((r) => r.day_start).sort((a, b) => a - b),
  };
}

/** The DB rows a draft expands to — one per day, all sharing a series id. */
function draftToRows(draft: BlockDraft, seriesId: string) {
  return draft.days.map((day) => ({
    title: draft.title,
    color: draft.color,
    day_start: day,
    day_end: day,
    start_minute: draft.start_minute,
    end_minute: draft.end_minute,
    // Legacy columns, kept in sync so older readers still work.
    hour_start: Math.floor(draft.start_minute / 60),
    hour_end: Math.ceil(draft.end_minute / 60),
    series_id: seriesId,
  }));
}

/** True if the draft would land on top of a block outside its own series. */
function overlapsExisting(
  draft: BlockDraft,
  blocks: PlannerBlock[],
  ignoreSeriesId?: string
): boolean {
  return blocks.some(
    (b) =>
      b.series_id !== ignoreSeriesId &&
      draft.days.includes(b.day_start) &&
      draft.start_minute < b.end_minute &&
      draft.end_minute > b.start_minute
  );
}

function toDayTagMap(rows: DayTag[]): DayTagMap {
  const map: DayTagMap = {};
  for (const row of rows) map[row.day] = row.tag;
  return map;
}

/** Steps a day through remote -> office -> free -> no tag. */
function nextDayTag(current: DayTagValue | undefined): DayTagValue | null {
  const idx = DAY_TAG_CYCLE.indexOf(current ?? null);
  return DAY_TAG_CYCLE[(idx + 1) % DAY_TAG_CYCLE.length];
}

function describeDbError(action: string, error: { code?: string; message: string }): string {
  // The table is missing entirely — the migrations were never applied.
  if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
    return 'A table this app needs is missing. Run supabase/setup.sql in your Supabase SQL Editor, then reload.';
  }
  // A column is missing — the newest migration has not been applied.
  if (error.code === 'PGRST204') {
    return `${error.message}. Run the latest file in supabase/migrations, then reload.`;
  }
  // RLS is on but no policy grants anon access.
  if (error.code === '42501') {
    return 'The database rejected the request (row level security). Check the policies on planner_blocks.';
  }
  return `Could not ${action} block: ${error.message}`;
}

export function formatTime(min: number): string {
  const clamped = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** "Every day", "Mon – Fri" for a run, otherwise "Mon, Wed, Fri". */
export function summarizeDays(days: number[]): string {
  if (days.length === 0) return 'No days';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isRun && sorted.length > 2) return `${DAYS[sorted[0]]} – ${DAYS[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAYS[d]).join(', ');
}

function formatHour(h: number): string {
  return formatTime(h * 60);
}

export function Planner() {
  const [blocks, setBlocks] = useState<PlannerBlock[]>([]);
  const [dayTags, setDayTags] = useState<DayTagMap>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [overlapError, setOverlapError] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragAnchorRef = useRef<Cell | null>(null);

  const fetchBlocks = useCallback(async () => {
    const { data, error } = await supabase
      .from('planner_blocks')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load blocks', error);
      setDbError(describeDbError('load', error));
      return;
    }
    setBlocks(data ?? []);
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      const tagRes = await supabase.from('day_tags').select('*');
      if (tagRes.error) {
        console.error('Failed to load day tags', tagRes.error);
        setDbError(describeDbError('load', tagRes.error));
      }
      setDayTags(toDayTagMap(tagRes.data ?? []));
      await fetchBlocks();
    };
    loadAll();
  }, [fetchBlocks]);

  const flashOverlapError = () => {
    setOverlapError(true);
    setTimeout(() => setOverlapError(false), 2200);
  };

  // --- Dragging -------------------------------------------------------------
  // Capture is taken on the grid container, not the cell under the pointer.
  // Capturing on the cell would route every later pointer event back to that
  // one cell, so the drag could never grow past where it started.

  const cellFromPoint = (clientX: number, clientY: number): Cell | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dayWidth = (rect.width - GUTTER_WIDTH) / DAYS.length;
    return {
      day: clamp(Math.floor((clientX - rect.left - GUTTER_WIDTH) / dayWidth), 0, DAYS.length - 1),
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
    if (target.closest('[data-block]') || target.closest('[data-header]')) return;

    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Ignore the header row and the time gutter.
    if (e.clientY - rect.top < HEADER_HEIGHT || e.clientX - rect.left < GUTTER_WIDTH) return;

    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    e.preventDefault();
    dragAnchorRef.current = cell;
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
    if (!dragAnchorRef.current || !selection) {
      dragAnchorRef.current = null;
      return;
    }
    dragAnchorRef.current = null;

    const newDraft = selectionToDraft(selection);
    setSelection(null);

    if (overlapsExisting(newDraft, blocks)) {
      flashOverlapError();
      return;
    }
    setDraft(newDraft);
  };

  const handlePointerCancel = () => {
    dragAnchorRef.current = null;
    setSelection(null);
  };

  // --- Persistence ----------------------------------------------------------

  const saveDraft = async (d: BlockDraft) => {
    if (overlapsExisting(d, blocks)) {
      flashOverlapError();
      return;
    }
    setDbError(null);
    const { data, error } = await supabase
      .from('planner_blocks')
      .insert(draftToRows(d, crypto.randomUUID()))
      .select();
    if (error) {
      console.error('Failed to save block', error);
      setDbError(describeDbError('save', error));
      return;
    }
    setBlocks((prev) => [...prev, ...(data ?? [])]);
    setDraft(null);
  };

  /**
   * Reconciles a series against the edited draft: days that stay are updated,
   * days that were added get new rows, days that were dropped are deleted.
   */
  const updateSeries = async (seriesId: string, d: BlockDraft) => {
    if (overlapsExisting(d, blocks, seriesId)) {
      flashOverlapError();
      return;
    }
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
      start_minute: d.start_minute,
      end_minute: d.end_minute,
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
            .insert(draftToRows({ ...d, days: addedDays }, seriesId))
        : Promise.resolve({ error: null }),
    ]);

    const failure = results.find((r) => r.error);
    if (failure?.error) {
      console.error('Failed to update block', failure.error);
      setDbError(describeDbError('update', failure.error));
    }

    // Three writes touched the series; re-read rather than patch it by hand.
    await fetchBlocks();
    setEditingSeriesId(null);
  };

  const deleteSeries = async (seriesId: string) => {
    setDbError(null);
    const { error } = await supabase.from('planner_blocks').delete().eq('series_id', seriesId);
    if (error) {
      console.error('Failed to delete block', error);
      setDbError(describeDbError('delete', error));
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.series_id !== seriesId));
    setEditingSeriesId(null);
  };

  const cycleDayTag = async (day: number) => {
    const next = nextDayTag(dayTags[day]);
    const previous = dayTags;

    // Optimistic: the pill is a rapid toggle, so don't wait on the round trip.
    setDayTags((prev) => {
      const updated = { ...prev };
      if (next) updated[day] = next;
      else delete updated[day];
      return updated;
    });
    setDbError(null);

    const { error } = next
      ? await supabase.from('day_tags').upsert({ day, tag: next }, { onConflict: 'day' })
      : await supabase.from('day_tags').delete().eq('day', day);

    if (error) {
      console.error('Failed to save day tag', error);
      setDbError(describeDbError('tag', error));
      setDayTags(previous);
    }
  };

  // --- Derived --------------------------------------------------------------

  const editingSeries = useMemo(
    () => (editingSeriesId ? blocks.filter((b) => b.series_id === editingSeriesId) : []),
    [blocks, editingSeriesId]
  );

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
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                Weekly Planner
              </h1>
              <p className="text-xs text-slate-500">Your reusable week template</p>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
            <Plus className="h-3.5 w-3.5" />
            Drag down to set the time, across to repeat it
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-2 py-6 sm:px-6">
        {overlapError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <X className="h-4 w-4" />
            Blocks can't overlap. Pick an empty area.
          </div>
        )}

        {dbError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{dbError}</span>
            <button
              onClick={() => setDbError(null)}
              className="rounded p-0.5 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/*
            touch-pan-y, not touch-none: the grid is ~1150px tall, so touch
            users must still be able to scroll the page vertically over it.
          */}
          <div
            ref={gridRef}
            className="grid touch-pan-y select-none"
            style={{
              gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${DAYS.length}, 1fr)`,
              gridTemplateRows: `${HEADER_HEIGHT}px repeat(${SLOTS_PER_DAY}, ${SLOT_HEIGHT}px)`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/* Header row */}
            <div
              data-header
              className="border-b border-slate-200 bg-slate-50"
              style={{ gridColumn: '1', gridRow: '1' }}
            />
            {DAYS.map((day, idx) => (
              <div
                key={day}
                data-header
                className="flex flex-col items-center justify-center gap-1 border-b border-l border-slate-200 bg-slate-50"
                style={{ gridColumn: `${idx + 2}`, gridRow: '1' }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 sm:text-sm">
                  {day}
                </span>
                <DayTagPill tag={dayTags[idx]} onClick={() => cycleDayTag(idx)} />
              </div>
            ))}

            {/* Hour label + slot cells per hour row */}
            {HOURS.map((hour) => (
              <HourRow key={hour} hour={hour} />
            ))}

            {/* Selection preview */}
            {selGrid && selDraft && (
              <div
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
              return (
                <button
                  key={b.id}
                  data-block
                  title={`${b.title} · ${formatTime(b.start_minute)} – ${formatTime(b.end_minute)}${
                    repeatCount > 1 ? ` · repeats on ${repeatCount} days` : ''
                  }`}
                  onClick={() => setEditingSeriesId(b.series_id)}
                  className={`group relative z-10 m-0.5 flex min-w-0 flex-col rounded-lg text-left text-white shadow-sm transition-all hover:shadow-md ${
                    isCompact ? 'overflow-visible p-0.5' : 'overflow-hidden p-2'
                  } ${
                    editingSeriesId === b.series_id
                      ? 'ring-2 ring-slate-900 ring-offset-1'
                      : 'hover:scale-[1.01]'
                  }`}
                  style={{
                    gridColumn: `${b.day_start + 2}`,
                    gridRow: `${slotStart + 2} / ${slotEnd + 2}`,
                    backgroundColor: b.color,
                  }}
                >
                  <span
                    className={`flex items-center gap-1 truncate font-semibold leading-tight ${
                      isCompact
                        ? 'absolute left-1 top-1 z-10 max-w-[calc(100%+160px)] rounded bg-inherit px-1 text-[10px]'
                        : 'text-xs sm:text-sm'
                    }`}
                  >
                    {repeatCount > 1 && <Repeat className="h-3 w-3 shrink-0 opacity-80" />}
                    <span className="truncate">{b.title}</span>
                  </span>
                  {!isCompact && (
                    <span className="mt-0.5 text-[10px] leading-tight opacity-80">
                      {formatTime(b.start_minute)} – {formatTime(b.end_minute)}
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
          isEditing={editingSeries.length > 0}
          onSave={(d) =>
            editingSeriesId ? updateSeries(editingSeriesId, d) : saveDraft(d)
          }
          onDelete={() => editingSeriesId && deleteSeries(editingSeriesId)}
          onClose={() => {
            setDraft(null);
            setEditingSeriesId(null);
          }}
        />
      )}
    </div>
  );
}

function DayTagPill({ tag, onClick }: { tag?: DayTagValue; onClick: () => void }) {
  const style = tag ? DAY_TAG_STYLES[tag] : null;
  const Icon = tag ? DAY_TAG_ICONS[tag] : null;
  const nextLabel = nextDayTag(tag);

  return (
    <button
      onClick={onClick}
      title={nextLabel ? `Set to ${DAY_TAG_STYLES[nextLabel].label}` : 'Remove tag'}
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors sm:text-[11px] ${
        style
          ? style.className
          : 'border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600'
      }`}
    >
      {tag && Icon ? (
        <>
          <Icon className="h-3 w-3" />
          {style?.label}
        </>
      ) : (
        <>
          <Plus className="h-3 w-3" />
          Tag
        </>
      )}
    </button>
  );
}

function HourRow({ hour }: { hour: number }) {
  const slotsInHour = HOUR_HEIGHT / SLOT_HEIGHT; // 4
  const baseSlot = hour * slotsInHour;
  return (
    <>
      {/* Time label spans the whole hour */}
      <div
        className="relative border-b border-slate-100 bg-slate-50/40"
        style={{ gridColumn: '1', gridRow: `${baseSlot + 2} / ${baseSlot + 2 + slotsInHour}` }}
      >
        <span className="absolute -top-2.5 right-2 text-[10px] font-medium text-slate-400">
          {formatHour(hour)}
        </span>
      </div>
      {/* Slot cells */}
      {DAYS.map((_, dayIdx) => (
        <SlotCells key={dayIdx} dayIdx={dayIdx} baseSlot={baseSlot} slotsInHour={slotsInHour} />
      ))}
    </>
  );
}

function SlotCells({
  dayIdx,
  baseSlot,
  slotsInHour,
}: {
  dayIdx: number;
  baseSlot: number;
  slotsInHour: number;
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
            } border-l border-slate-100 transition-colors hover:bg-slate-50/70`}
            style={{ gridColumn: `${dayIdx + 2}`, gridRow: `${slot + 2}` }}
          >
            {!isHourBoundary && (
              <div className="absolute left-0 top-0 h-px w-1.5 bg-slate-200" />
            )}
          </div>
        );
      })}
    </>
  );
}
