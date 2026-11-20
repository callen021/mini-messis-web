import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useIsPlatformAdmin } from '@/admin/useIsPlatformAdmin';
import { STAFF_ROLES } from '@/auth/guards';
import { useWakeLock } from '@/clock/useWakeLock';
import { Button } from '@/components/Button';
import { Group } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { ROTATION } from '@/training/rotation';
import { useLibraryItem, useSetLibraryPublished } from './api';
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
  const isAdmin = useIsPlatformAdmin() === true;
  const setPublished = useSetLibraryPublished();
  const sheet = useActionSheet();
  const toast = useToast();
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
  // Publish / Unpublish (D139): platform admins only, since an item is shared by every team
  const publish = (published: boolean) =>
    setPublished.mutate(
      { itemId: row.id, published },
      {
        onSuccess: () => toast(published ? `${row.title} is published` : `${row.title} is a draft again`),
        onError: (e) => toast(errorMessage(e)),
      },
    );
  const unpublish = async () => {
    const inRotation = row.category === 'home' && ROTATION.some((s) => s === row.slug);
    const ok = await sheet({
      title: `Unpublish ${row.title}?`,
      message: inRotation
        ? 'Parents will no longer see it, and another drill will show in its place in Daily Drills.'
        : 'Parents and coaches will no longer see it.',
      actions: [{ label: 'Unpublish', value: true, destructive: true }],
    });
    if (ok) publish(false);
  };
  return (
    <Page title={row.title} sub={sub} back={BACK} className="libitem">
      {!row.is_published && (
        <div className="libdraft" role="status">
          Draft: only platform admins can see this item until it is published.
          {isAdmin && (
            <Button size="sm" disabled={setPublished.isPending} onClick={() => publish(true)}>
              Publish
            </Button>
          )}
        </div>
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
      {isAdmin && row.is_published && (
        <p className="libunpublish">
          Published for every team.{' '}
          <button
            type="button"
            className="linkbtn"
            disabled={setPublished.isPending}
            onClick={() => void unpublish()}
          >
            Unpublish
          </button>
        </p>
      )}
    </Page>
  );
}
