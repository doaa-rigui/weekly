import { createClient } from '@supabase/supabase-js';
import type { DayTagValue } from './constants';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * One row = one day. A block repeated across several days is several rows
 * sharing a `series_id`; `day_start` and `day_end` are always equal.
 */
export type PlannerBlock = {
  id: string;
  title: string;
  color: string;
  day_start: number;
  day_end: number;
  start_minute: number;
  end_minute: number;
  series_id: string;
  created_at: string;
};

/** What the edit panel works with: one time range plus the days it repeats on. */
export type BlockDraft = {
  title: string;
  color: string;
  start_minute: number;
  end_minute: number;
  days: number[];
};

export type DayTag = {
  day: number;
  tag: DayTagValue;
  created_at: string;
};
