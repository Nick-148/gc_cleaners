/**
 * Facts from Gordon College's official published policies.
 *
 * Rules (AGENTS.md, ADR 0011):
 *  - Every figure must come from an official gordon.edu page, cited in `source`.
 *  - Re-verify each semester and update `policyVerifiedOn`.
 *  - Paraphrase; don't copy long passages. Never round, guess or invent amounts.
 */

export const RESLIFE_POLICIES_URL = 'https://www.gordon.edu/studenthandbook/reslife';
export const STUDENT_HANDBOOK_URL =
  'https://www.gordon.edu/life/residence-life-dining/student-handbook';
export const RESIDENCE_HALLS_URL =
  'https://www.gordon.edu/life/residence-life-dining/residence-halls';

/** Date the facts below were last checked against the official pages. */
export const policyVerifiedOn = '2026-11-02';

export interface PolicyFine {
  id: string;
  /** What triggers the fine, in plain language. */
  trigger: string;
  amountCents: number;
  /** Extra wording around the amount, e.g. "at least" or "plus damages". */
  qualifier?: string;
  /** Why it matters to a student preparing for inspection. */
  context: string;
  source: string;
}

export const fines: readonly PolicyFine[] = [
  {
    id: 'post-inspection',
    trigger: 'Room violation found after the start-of-semester inspection period',
    amountCents: 2500,
    context:
      'Residence Life inspects rooms during the first two weeks of each semester and gives you a deadline to fix problems. Violations noted after that period carry a fine.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'improper-checkout',
    trigger: 'Improper checkout',
    amountCents: 3000,
    context:
      'Checkout is in person: you inventory the room with staff, sign the checkout form and return keys. Skipping the process is fined.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'combustibles',
    trigger: 'Candles, incense, aerosol diffusers or other combustibles',
    amountCents: 10000,
    context: 'Keep candles, incense and plug-in or aerosol diffusers out of the room entirely.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'window-screen',
    trigger: 'Window screen removed (charged per student in the room)',
    amountCents: 2500,
    qualifier: 'plus damages',
    context: 'Keep screens in place, even when you open windows to air out the room.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'furniture',
    trigger: 'College furniture or equipment removed without permission',
    amountCents: 2500,
    qualifier: 'at least',
    context: 'All college furniture has to stay in the room it belongs to.',
    source: RESLIFE_POLICIES_URL,
  },
] as const;

export interface PolicyFact {
  id: string;
  text: string;
  source: string;
}

/** Cleaning-related responsibilities students carry under the published policies. */
export const cleaningResponsibilities: readonly PolicyFact[] = [
  {
    id: 'minimum-standards',
    text: 'Students are responsible for keeping their rooms to a minimum standard of cleanliness.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'rci',
    text: 'At checkout you are held responsible for any damage or custodial (cleaning) needs that weren’t recorded on your Room Condition Inventory (RCI) when you moved in.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'apartments',
    text: 'Apartments get a thorough inspection at least once a semester, and the cost of cleaning or repairs for excessive wear is charged to the residents.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'food',
    text: 'Food must be stored in airtight containers, and take-out boxes belong in the building’s main trash area, not bathroom or hallway bins.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'cooking',
    text: 'Cooking and heating appliances, including air fryers, aren’t allowed in student rooms.',
    source: RESLIFE_POLICIES_URL,
  },
  {
    id: 'fines-vs-damages',
    text: 'Fines are separate from paying for damage you cause, so a fine and a repair charge can both apply.',
    source: RESLIFE_POLICIES_URL,
  },
] as const;
