/**
 * The inspection-readiness checklist shown on Services & Rates.
 * `basis: 'gordon'` items restate a published Gordon policy (see gordon-policy.ts).
 * `basis: 'ours'` items are our own cleaning standard. Label them honestly.
 */

export type ChecklistBasis = 'gordon' | 'ours';

export interface ChecklistItem {
  text: string;
  basis: ChecklistBasis;
  /** Whether a Scot-Free cleaner handles it, or it's on the resident. */
  whoHandles: 'us' | 'you';
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: readonly ChecklistItem[];
}

export const inspectionChecklist: readonly ChecklistGroup[] = [
  {
    id: 'room',
    title: 'Bedroom',
    items: [
      {
        text: 'Floors vacuumed or swept and mopped, including under the bed and desk',
        basis: 'ours',
        whoHandles: 'us',
      },
      {
        text: 'Desks, dressers, shelves and windowsills dusted and wiped',
        basis: 'ours',
        whoHandles: 'us',
      },
      {
        text: 'Trash and recycling emptied; take-out boxes taken to the main trash area',
        basis: 'gordon',
        whoHandles: 'us',
      },
      {
        text: 'Mirrors, glass, light switches and door handles wiped',
        basis: 'ours',
        whoHandles: 'us',
      },
      { text: 'Food sealed in airtight containers', basis: 'gordon', whoHandles: 'you' },
    ],
  },
  {
    id: 'bathroom',
    title: 'Suite or apartment bathroom',
    items: [
      {
        text: 'Shower or tub scrubbed: soap scum, mildew and grout',
        basis: 'ours',
        whoHandles: 'us',
      },
      {
        text: 'Toilet cleaned and disinfected inside, outside and around the base',
        basis: 'ours',
        whoHandles: 'us',
      },
      {
        text: 'Sink, counter and faucet scrubbed; mirror streak-free',
        basis: 'ours',
        whoHandles: 'us',
      },
      {
        text: 'Floor mopped, including corners and behind the door',
        basis: 'ours',
        whoHandles: 'us',
      },
    ],
  },
  {
    id: 'policy',
    title: 'Things only you can fix',
    items: [
      {
        text: 'No candles, incense, aerosol diffusers or other combustibles in the room',
        basis: 'gordon',
        whoHandles: 'you',
      },
      { text: 'Window screens installed and in place', basis: 'gordon', whoHandles: 'you' },
      { text: 'All college furniture stays in the room', basis: 'gordon', whoHandles: 'you' },
      {
        text: 'No cooking or heating appliances, including air fryers',
        basis: 'gordon',
        whoHandles: 'you',
      },
      {
        text: 'Any existing damage recorded on your Room Condition Inventory (RCI)',
        basis: 'gordon',
        whoHandles: 'you',
      },
    ],
  },
] as const;

export const betweenVisitTips: readonly { title: string; body: string }[] = [
  {
    title: 'Do a five-minute reset every night',
    body: 'Clothes in the hamper, dishes out, desk cleared. Small daily habits stop the weekend pile-up.',
  },
  {
    title: 'Take the trash out before it’s full',
    body: 'Food waste is what makes rooms smell. Take out-of-date food and take-out boxes to the main trash area.',
  },
  {
    title: 'Squeegee or towel the shower after use',
    body: 'Wiping walls down for 30 seconds keeps soap scum and mildew from building up between deep cleans.',
  },
  {
    title: 'Keep a wipe kit in reach',
    body: 'A pack of disinfecting wipes by the sink makes it easy to wipe the counter and toilet seat twice a week.',
  },
  {
    title: 'Agree on a roommate rotation',
    body: 'Split bathroom, trash and floor duties weekly so nobody gets stuck with everything before inspection.',
  },
  {
    title: 'Check the room against the list before inspections',
    body: 'Run through the checklist on our Services page the week before an inspection or checkout, and book us if it looks like a big job.',
  },
] as const;
