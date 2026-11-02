import { bookingRules, site } from '../config/site';

export interface FaqItem {
  id: string;
  question: string;
  /** Plain text answer; paragraphs separated by blank lines. */
  answer: string;
}

export const faq: readonly FaqItem[] = [
  {
    id: 'affiliation',
    question: 'Are you part of Gordon College?',
    answer: `No. ${site.name} is an independent, student-run business. We aren’t affiliated with, endorsed by or sponsored by Gordon College, and we can’t speak for Residence Life. For official policy, always check the Student Handbook.`,
  },
  {
    id: 'guarantee',
    question: 'Do you guarantee I’ll pass inspection?',
    answer:
      'No one can promise that, because inspections cover more than cleanliness (for example candles, window screens and furniture). What we do promise is a thorough clean against our published checklist. If anything on it was missed, let us know through the Contact page.',
  },
  {
    id: 'payment',
    question: 'How do I pay?',
    answer: `In person, when your cleaning is done, with cash or Venmo (${site.contact.venmoHandle}). We never ask for card details online and you don’t pay anything to book.`,
  },
  {
    id: 'present',
    question: 'Do I need to be there?',
    answer:
      'Yes. Someone who lives in the room needs to let us in. We don’t borrow keys or ID cards. You’re welcome to step out once we’ve started.',
  },
  {
    id: 'supplies',
    question: 'Do I need to provide supplies?',
    answer:
      'No. We bring our own cleaning supplies and equipment. If you have allergies or prefer fragrance-free products, add a note when you book.',
  },
  {
    id: 'communal',
    question: 'Can you clean the shared bathroom on my floor?',
    answer:
      'No. In traditional halls with shared floor bathrooms, those bathrooms are maintained by the college. Our Bathroom Clean is for suite and apartment bathrooms that residents are responsible for.',
  },
  {
    id: 'cancel',
    question: 'How do I cancel or reschedule?',
    answer: `Send us a message through the Contact page with your booking reference at least ${bookingRules.cancellationNoticeHours} hours before your window. Cancelling or rescheduling with that much notice is free. Repeated late cancellations or no-shows may mean we can’t take future bookings.`,
  },
  {
    id: 'messy',
    question: 'My room is really messy. Can you still help?',
    answer:
      'Probably! For heavy messes, end-of-year move-outs or anything unusual, use Get a Quote and upload a few photos. We’ll reply with a custom price before you commit to anything.',
  },
  {
    id: 'damage',
    question: 'Do you fix damage or do repairs?',
    answer:
      'No. We only clean. Report damage to Residence Life and record existing damage on your Room Condition Inventory (RCI) when you move in.',
  },
  {
    id: 'cleaners',
    question: 'Who are the cleaners?',
    answer:
      'Fellow students who’ve been trained on our checklist. Want to join them? Cleaners keep 75% of every job. See Work With Us.',
  },
  {
    id: 'privacy',
    question: 'What happens to my information?',
    answer:
      'We use it only to schedule and carry out your cleaning and to contact you about it. Quote photos are deleted automatically after 90 days. See our Privacy page for details.',
  },
] as const;
