import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { STAFF_ROLES } from '@/auth/guards';
import { useWakeLock } from '@/clock/useWakeLock';
import { Group } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useLibraryItem } from './api';
import { HomeTab } from './HomeTab';
import { LearnTab } from './LearnTab';
import { SetupTab } from './SetupTab';
import { ageText, categoryLabel, parseContent, TAB_LABEL, type TabKey, tabsOf } from './types';

const BACK = { to: '/training?tab=library', label: 'Library', pop: true } as const;

/**
 * One library item (D123): title, category and ages, then a tab per content section. Every team
 * member sees both tabs for now; only coaches and assistant coaches get the setup controls. The
 * screen stays awake while the page is open (a phone propped up at practice).
 */
export function LibraryItemPage() {
  const { slug } = useParams();
  const { team, role } = useCurrentTeam();
  const item = useLibraryItem(slug);
  const [search, setSearch] = useSearchParams();
  useWakeLock(true);

  const row = item.data ?? null;
  const content = useMemo(() => parseContent(row?.content), [row?.content]);
  const tabs = tabsOf(content);
  const wanted = search.get('tab');
  const tab: TabKey | undefined = tabs.find((t) => t === wanted) ?? tabs[0];

  if (item.isPending) {
    return (
      <Page title="Practice library" back={BACK}>
        <Group>
          <div className="empty">Loading…</div>
        </Group>
      </Page>
    );
  }
  // an item of another sport is not in this team's library
  if (item.isError || !row || row.sport !== team.sport) {
    return (
      <Page title="Not found" back={BACK}>
        <Group>
          <div className="empty" role={item.isError ? 'alert' : undefined}>
            {item.isError ? errorMessage(item.error) : 'This item is not in your team’s practice library.'}
          </div>
        </Group>
      </Page>
    );
  }

  const sub = [categoryLabel(row.category), ageText(row.age_min, row.age_max)].filter(Boolean).join(' · ');
  return (
    <Page title={row.title} sub={sub} back={BACK} className="libitem">
      {!row.is_published && (
        <p className="libdraft" role="status">
          Draft: only you can see this item until it is published.
        </p>
      )}
      {tabs.length > 1 && tab && (
        <Segmented<TabKey>
          wide
          label="Section"
          value={tab}
          onChange={(t) => setSearch(t === tabs[0] ? {} : { tab: t }, { replace: true })}
          options={tabs.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        />
      )}
      {tab === 'learn' && content.learn && <LearnTab learn={content.learn} />}
      {tab === 'setup' && content.setup && (
        <SetupTab
          setup={content.setup}
          teamId={team.id}
          itemId={row.id}
          canEdit={STAFF_ROLES.includes(role)}
        />
      )}
      {tab === 'home' && content.home && <HomeTab home={content.home} />}
    </Page>
  );
}
