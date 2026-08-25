import { createClient } from '@supabase/supabase-js';
import type { ColorKind, DayTagValue } from './constants';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * One named week. An account can hold several — a chores planner, a study
 * planner — and every block and day tag belongs to exactly one of them.
 */
export type PlannerRecord = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/**
 * One row = one day. A block repeated across several days is several rows
 * sharing a `series_id`; `day_start` and `day_end` are always equal.
 */
export type PlannerBlock = {
  id: string;
  user_id: string;
  planner_id: string;
  title: string;
  color: string;
  day_start: number;
  day_end: number;
  start_minute: number;
  end_minute: number;
  series_id: string;
  text_color: string;
  created_at: string;
};

/** What the edit panel works with: one time range plus the days it repeats on. */
export type BlockDraft = {
  title: string;
  color: string;
  text_color: string;
  start_minute: number;
  end_minute: number;
  days: number[];
};

export type RecentColor = {
  user_id: string;
  kind: ColorKind;
  color: string;
  used_at: string;
};

export type DayTag = {
  user_id: string;
  planner_id: string;
  day: number;
  tag: DayTagValue;
  created_at: string;
};
