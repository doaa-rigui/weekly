import { Download, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { HabitSettings } from '@/lib/habitSettings';
import type { HabitStore } from '@/lib/habitStore';
import { describeFrequency, isoDateOf } from '@/lib/habits';
import { Card, CardHeader, GhostButton, Segmented, Toggle } from './ui';

/**
 * Settings. Three preferences, a way out with your data, and the account.
 *
 * Every option here changes how a page is drawn rather than what it says, and
 * all three live in this browser's storage — see `@/lib/habitSettings` for why
 * none of them is worth a row in the database.
 */
export function SettingsPage({
  store,
  settings,
  onChange,
}: {
  store: HabitStore;
  settings: HabitSettings;
  onChange: <K extends keyof HabitSettings>(key: K, value: HabitSettings[K]) => void;
}) {
  const { user, signOut } = useAuth();

  /**
   * Everything this app knows about you, as one JSON file. Built in the
   * browser from what is already loaded — no export endpoint, no round trip,
   * and nothing leaves the page except into your own downloads folder.
   */
  const exportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      habits: store.habits.map((habit) => ({
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        frequency: habit.frequency,
        anchor_date: habit.anchor_date,
        created_at: habit.created_at,
      })),
      entries: [...store.entries.values()]
        .map((entry) => ({
          habit: store.habits.find((habit) => habit.id === entry.habit_id)?.name ?? null,
          date: entry.on_date,
          status: entry.status,
          note: entry.note,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `habits-${isoDateOf(new Date())}.json`;
    link.click();
    // Freed on the next tick: revoking it synchronously can beat the download
    // to the punch in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-clay-900">Settings</h1>
        <p className="mt-1 text-sm text-clay-500">
          Small preferences, kept in this browser.
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader title="Preferences" />
          <div className="divide-y divide-clay-200/70">
            <Row
              title="Week starts on"
              description="Which day a week begins with in the Stats charts."
            >
              <Segmented
                options={[
                  { value: 'monday', label: 'Monday' },
                  { value: 'sunday', label: 'Sunday' },
                ]}
                value={settings.weekStart}
                onChange={(value) => onChange('weekStart', value)}
                label="Week starts on"
              />
            </Row>

            <Row
              title="Ask why when a habit is undone"
              description="Offers a short note straight away. The note is optional either way — turning this off just means asking for it instead of being offered it."
            >
              <Toggle
                checked={settings.askWhyOnUndone}
                onChange={(value) => onChange('askWhyOnUndone', value)}
                label="Ask why when a habit is undone"
              />
            </Row>

            <Row
              title="Show streaks on Today"
              description="Off by default. Today is about the day in front of you, not the run behind it."
            >
              <Toggle
                checked={settings.showStreaksOnToday}
                onChange={(value) => onChange('showStreaksOnToday', value)}
                label="Show streaks on Today"
              />
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your data" />
          <div className="divide-y divide-clay-200/70">
            <Row
              title="Export"
              description={`${store.habits.length} ${
                store.habits.length === 1 ? 'habit' : 'habits'
              } and ${store.entries.size} logged ${
                store.entries.size === 1 ? 'day' : 'days'
              }, as a JSON file.`}
            >
              <GhostButton onClick={exportData}>
                <Download className="h-3.5 w-3.5" />
                Download
              </GhostButton>
            </Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <div className="divide-y divide-clay-200/70">
            <Row
              title={user?.email ?? 'Signed in'}
              description="The same account as the planner and the sleep tracker. They share a sign-in and nothing else."
            >
              <GhostButton onClick={signOut}>
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </GhostButton>
            </Row>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 max-w-md">
        <p className="truncate text-sm font-medium text-clay-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-clay-500">{description}</p>
      </div>
      {children}
    </div>
  );
}
