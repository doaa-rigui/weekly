import { createClient } from '@supabase/supabase-js';
import type { DayTagValue } from './constants';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PlannerBlock = {
  id: string;
  title: string;
  color: string;
  day_start: number;
  day_end: number;
  start_minute: number;
  end_minute: number;
  created_at: string;
};

export type BlockDraft = Omit<PlannerBlock, 'id' | 'created_at'>;

export type DayTag = {
  day: number;
  tag: DayTagValue;
  created_at: string;
};
