import { useCallback, useRef, useState } from 'react';
import { supabase, type PlannerBlock, type BlockDraft, type DayTag } from '@/lib/supabase';
import {
  DAYS,
  HOURS,
  HOUR_HEIGHT,
  SLOT_HEIGHT,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  MINUTES_PER_DAY,
  PALETTE,
  DAY_TAG_CYCLE,
  DAY_TAG_STYLES,
  type DayTagValue,
} from '@/lib/constants';
import { EditPanel } from './EditPanel';
import { Building2, CalendarDays, House, Palmtree, Plus, X } from 'lucide-react';

const DAY_TAG_ICONS = {
  remote: House,
  office: Building2,
  free: Palmtree,
} as const;

type DayTagMap = Partial<Record<number, DayTagValue>>;

type Selection = {
  dayStart: number;
  dayEnd: number;
  slotStart: number;
  slotEnd: number;
};

function normalizeSelection(sel: Selection): BlockDraft {
  const slotStart = Math.min(sel.slotStart, sel.slotEnd);
  const slotEnd = Math.max(sel.slotStart, sel.slotEnd) + 1;
  return {
    title: 'New block',
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    day_start: Math.min(sel.dayStart, sel.dayEnd),
    day_end: Math.max(sel.dayStart, sel.dayEnd),
    start_minute: slotStart * SLOT_MINUTES,
    end_minute: Math.min(slotEnd * SLOT_MINUTES, MINUTES_PER_DAY),
  };
}

function blocksOverlap(a: BlockDraft, b: PlannerBlock): boolean {
  return (
    a.day_start <= b.day_end &&
    a.day_end >= b.day_start &&
    a.start_minute < b.end_minute &&
    a.end_minute > b.start_minute
  );
}

type InsertPayload = Partial<BlockDraft> & {
  hour_start?: number;
  hour_end?: number;
};

function withLegacyHours(d: Partial<BlockDraft>): InsertPayload {
  const out: InsertPayload = { ...d };
  if (d.start_minute != null) out.hour_start = Math.floor(d.start_minute / 60);
  if (d.end_minute != null) out.hour_end = Math.ceil(d.end_minute / 60);
  return out;
}

function toDayTagMap(rows: DayTag[]): DayTagMap {
  const map: DayTagMap = {};
  for (const row of rows) map[row.day] = row.tag;
  return map;
}

/** Steps a day through remote -> office -> no tag. */
function nextDayTag(current: DayTagValue | undefined): DayTagValue | null {
  const idx = DAY_TAG_CYCLE.indexOf(current ?? null);
  return DAY_TAG_CYCLE[(idx + 1) % DAY_TAG_CYCLE.length];
}

function describeDbError(action: string, error: { code?: string; message: string }): string {
  // The table is missing entirely — the migrations were never applied.
  if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
    return 'A table this app needs is missing. Run supabase/setup.sql in your Supabase SQL Editor, then reload.';
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

function formatHour(h: number): string {
  return formatTime(h * 60);
}

export function Planner() {
  const [blocks, setBlocks] = useState<PlannerBlock[]>([]);
  const [dayTags, setDayTags] = useState<DayTagMap>({});
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overlapError, setOverlapError] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const dragStartRef = useRef<{ day: number; slot: number } | null>(null);

  const loadBlocks = useCallback(async () => {
    const [blockRes, tagRes] = await Promise.all([
      supabase.from('planner_blocks').select('*').order('created_at', { ascending: true }),
      supabase.from('day_tags').select('*'),
    ]);
    if (blockRes.error) {
      console.error('Failed to load blocks', blockRes.error);
      setDbError(describeDbError('load', blockRes.error));
    }
    if (tagRes.error) {
      console.error('Failed to load day tags', tagRes.error);
      setDbError(describeDbError('load', tagRes.error));
    }
    setBlocks(blockRes.data ?? []);
    setDayTags(toDayTagMap(tagRes.data ?? []));
    setLoaded(true);
  }, []);

  if (!loaded) {
    loadBlocks();
  }

  const handlePointerDown = (e: React.PointerEvent, day: number, slot: number) => {
    if (editingId || draft) return;
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    e.preventDefault();
    dragStartRef.current = { day, slot };
    setSelection({ dayStart: day, dayEnd: day, slotStart: slot, slotEnd: slot });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerEnter = (day: number, slot: number) => {
    if (!dragStartRef.current || !selection) return;
    const start = dragStartRef.current;
    setSelection({
      dayStart: start.day,
      dayEnd: day,
      slotStart: start.slot,
      slotEnd: slot,
    });
  };

  const handlePointerUp = () => {
    if (!selection || !dragStartRef.current) {
      dragStartRef.current = null;
      return;
    }
    const newDraft = normalizeSelection(selection);
    const overlaps = blocks.some((b) => blocksOverlap(newDraft, b));
    if (overlaps) {
      setOverlapError(true);
      setTimeout(() => setOverlapError(false), 2200);
    } else {
      setDraft(newDraft);
    }
    dragStartRef.current = null;
    setSelection(null);
  };

  const saveDraft = async (d: BlockDraft) => {
    setDbError(null);
    const { data, error } = await supabase
      .from('planner_blocks')
      .insert(withLegacyHours(d))
      .select()
      .single();
    if (error) {
      console.error('Failed to save block', error);
      setDbError(describeDbError('save', error));
      return;
    }
    setBlocks((prev) => [...prev, data]);
    setDraft(null);
  };

  const updateBlock = async (id: string, patch: Partial<BlockDraft>) => {
    setDbError(null);
    const { data, error } = await supabase
      .from('planner_blocks')
      .update(withLegacyHours(patch))
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Failed to update block', error);
      setDbError(describeDbError('update', error));
      return;
    }
    setBlocks((prev) => prev.map((b) => (b.id === id ? data : b)));
    setEditingId(null);
  };

  const deleteBlock = async (id: string) => {
    setDbError(null);
    const { error } = await supabase.from('planner_blocks').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete block', error);
      setDbError(describeDbError('delete', error));
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setEditingId(null);
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

  const editingBlock = blocks.find((b) => b.id === editingId) ?? null;
  const activeDraft = draft ?? (editingBlock ? { ...editingBlock } : null);

  const selGrid = selection
    ? {
        colStart: Math.min(selection.dayStart, selection.dayEnd) + 2,
        colEnd: Math.max(selection.dayStart, selection.dayEnd) + 3,
        rowStart: Math.min(selection.slotStart, selection.slotEnd) + 2,
        rowEnd: Math.max(selection.slotStart, selection.slotEnd) + 3,
      }
    : null;

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
            Drag on the grid to add a block
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
          <div
            className="grid select-none"
            style={{
              gridTemplateColumns: `56px repeat(7, 1fr)`,
              gridTemplateRows: `68px repeat(${SLOTS_PER_DAY}, ${SLOT_HEIGHT}px)`,
            }}
          >
            {/* Header row */}
            <div
              className="border-b border-slate-200 bg-slate-50"
              style={{ gridColumn: '1', gridRow: '1' }}
            />
            {DAYS.map((day, idx) => (
              <div
                key={day}
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
              <HourRow
                key={hour}
                hour={hour}
                onPointerDown={handlePointerDown}
                onPointerEnter={handlePointerEnter}
                onPointerUp={handlePointerUp}
              />
            ))}

            {/* Selection preview */}
            {selGrid && (
              <div
                className="pointer-events-none z-20 m-0.5 rounded-md border-2 border-blue-500 bg-blue-400/20"
                style={{
                  gridColumn: `${selGrid.colStart} / ${selGrid.colEnd}`,
                  gridRow: `${selGrid.rowStart} / ${selGrid.rowEnd}`,
                }}
              />
            )}

            {/* Placed blocks */}
            {blocks.map((b) => {
              const slotStart = Math.floor(b.start_minute / SLOT_MINUTES);
              const slotEnd = Math.ceil(b.end_minute / SLOT_MINUTES);
              const isCompact = b.end_minute - b.start_minute <= 60;
              return (
                <button
                  key={b.id}
                  data-block
                  title={`${b.title} · ${formatTime(b.start_minute)} – ${formatTime(b.end_minute)}`}
                  onClick={() => setEditingId(b.id)}
                  className={`group relative z-10 m-0.5 flex min-w-0 flex-col rounded-lg text-left text-white shadow-sm transition-all hover:shadow-md ${
                    isCompact ? 'overflow-visible p-0.5' : 'overflow-hidden p-2'
                  } ${
                    editingId === b.id
                      ? 'ring-2 ring-slate-900 ring-offset-1'
                      : 'hover:scale-[1.01]'
                  }`}
                  style={{
                    gridColumn: `${b.day_start + 2} / ${b.day_end + 3}`,
                    gridRow: `${slotStart + 2} / ${slotEnd + 2}`,
                    backgroundColor: b.color,
                  }}
                >
                  <span
                    className={`truncate font-semibold leading-tight ${
                      isCompact
                        ? 'absolute left-1 top-1 z-10 max-w-[calc(100%+160px)] rounded bg-inherit px-1 text-[10px]'
                        : 'text-xs sm:text-sm'
                    }`}
                  >
                    {b.title}
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

      {(draft || editingBlock) && activeDraft && (
        <EditPanel
          draft={activeDraft}
          isEditing={!!editingBlock}
          onSave={(d) => (editingBlock ? updateBlock(editingBlock.id, d) : saveDraft(d))}
          onDelete={() => editingBlock && deleteBlock(editingBlock.id)}
          onClose={() => {
            setDraft(null);
            setEditingId(null);
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
      title={
        nextLabel
          ? `Set to ${DAY_TAG_STYLES[nextLabel].label}`
          : 'Remove tag'
      }
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

function HourRow({
  hour,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  hour: number;
  onPointerDown: (e: React.PointerEvent, day: number, slot: number) => void;
  onPointerEnter: (day: number, slot: number) => void;
  onPointerUp: () => void;
}) {
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
        <SlotCells
          key={dayIdx}
          dayIdx={dayIdx}
          baseSlot={baseSlot}
          slotsInHour={slotsInHour}
          onPointerDown={onPointerDown}
          onPointerEnter={onPointerEnter}
          onPointerUp={onPointerUp}
        />
      ))}
    </>
  );
}

function SlotCells({
  dayIdx,
  baseSlot,
  slotsInHour,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  dayIdx: number;
  baseSlot: number;
  slotsInHour: number;
  onPointerDown: (e: React.PointerEvent, day: number, slot: number) => void;
  onPointerEnter: (day: number, slot: number) => void;
  onPointerUp: () => void;
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
            onPointerDown={(e) => onPointerDown(e, dayIdx, slot)}
            onPointerEnter={() => onPointerEnter(dayIdx, slot)}
            onPointerUp={onPointerUp}
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
