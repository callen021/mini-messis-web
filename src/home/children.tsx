import { ChevronDownIcon } from '@/components/icons';
import { useActionSheet } from '@/components/Sheet';
import { type Player } from '@/teams/api';

/**
 * The selected child's name. With two or more children on the team it is a button that opens
 * the list of them; with one it is plain text.
 */
export function ChildSwitcher({
  kids,
  child,
  onSelect,
}: {
  kids: readonly Pick<Player, 'id' | 'first_name'>[];
  child: Pick<Player, 'id' | 'first_name'>;
  onSelect: (id: string) => void;
}) {
  const sheet = useActionSheet();
  if (kids.length < 2) return <>{child.first_name}</>;
  const choose = async () => {
    const id = await sheet<string>({
      title: 'Which child?',
      actions: kids.map((k) => ({
        label: k.id === child.id ? `${k.first_name} ✓` : k.first_name,
        value: k.id,
      })),
    });
    if (id) onSelect(id);
  };
  return (
    <button
      type="button"
      className="childswitch"
      aria-label={`${child.first_name}. Switch child`}
      aria-haspopup="dialog"
      onClick={() => void choose()}
    >
      {child.first_name}
      <ChevronDownIcon aria-hidden="true" />
    </button>
  );
}
