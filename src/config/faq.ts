export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Pages where this FAQ should appear. */
  pages: Array<'home' | 'pricing' | 'web-design' | 'seo' | 'website-care' | 'contact'>;
}

export const faqs: FaqItem[] = [
  {
    id: 'starting-at',
    question: 'What does “starting at” mean?',
    answer:
      '“Starting at” is the published entry price for a typical project in that package. Your final quote depends on pages, features, content readiness, integrations, and SEO scope. We confirm scope in writing before any invoice or checkout for a fixed amount.',
    pages: ['home', 'pricing', 'web-design', 'contact'],
  },
  {
    id: 'timeline',
    question: 'How long does a website project take?',
    answer:
      'Premium Theme websites typically take 2–4 weeks. Custom websites typically take 6–10 weeks. Custom Website + SEO Launch typically takes 8–12 weeks. Timelines depend on feedback speed, content readiness, and approved scope.',
    pages: ['home', 'pricing', 'web-design'],
  },
  {
    id: 'revisions',
    question: 'How do revisions work?',
    answer:
      'Each project includes a defined revision window during design and pre-launch review. Out-of-scope changes or new feature requests are estimated separately so the original delivery date and budget stay clear.',
    pages: ['pricing', 'web-design'],
  },
  {
    id: 'content',
    question: 'Do I need to provide content and photos?',
    answer:
      'Yes—most projects move fastest when you provide brand assets, service descriptions, and photos. We can guide structure and on-page messaging. Full copywriting or photography can be scoped as an add-on when needed.',
    pages: ['home', 'pricing', 'web-design'],
  },
  {
    id: 'ownership',
    question: 'Who owns the website when the project is finished?',
    answer:
      'After final payment for the agreed project scope, you own the website deliverables created for you, subject to third-party licences (such as a premium theme, plugins, fonts, or stock assets). Those third-party licences remain with their respective owners.',
    pages: ['pricing', 'web-design'],
  },
  {
    id: 'hosting',
    question: 'Is hosting included?',
    answer:
      'Hosting is not automatically included unless we agree to it in writing. We can recommend reliable WordPress hosting and configure your site for launch. Website Care covers maintenance, backups, and monitoring—not hosting fees—unless otherwise stated.',
    pages: ['pricing', 'website-care', 'web-design'],
  },
  {
    id: 'seo-expectations',
    question: 'Can you guarantee search rankings?',
    answer:
      'No. Ethical SEO improves foundations, visibility opportunities, and conversion pathways, but search engines control rankings. We never promise specific positions, traffic numbers, or timelines that cannot be controlled.',
    pages: ['home', 'pricing', 'seo'],
  },
  {
    id: 'seo-vs-launch',
    question: 'What is the difference between SEO Launch and SEO Growth?',
    answer:
      'SEO Launch is a one-time foundation delivered with a new custom website (research, technical SEO, on-page setup, tracking, and 30-day post-launch support). SEO & Conversion Growth is an ongoing monthly plan for continuous improvements, reporting, and conversion work on an existing site.',
    pages: ['pricing', 'seo', 'home'],
  },
  {
    id: 'subscriptions',
    question: 'How do monthly plans work?',
    answer:
      'SEO & Conversion Growth starts at CAD $499/month and Website Care & Maintenance starts at CAD $199/month. Plans renew monthly and can be cancelled according to the refund and cancellation policy. Billing is handled securely through Stripe.',
    pages: ['pricing', 'seo', 'website-care'],
  },
  {
    id: 'cancellation',
    question: 'How do I cancel a monthly plan?',
    answer:
      'You can request cancellation according to the published refund and cancellation policy. We process cancellations without dark patterns or hidden retention traps. Please review that policy for notice periods and what happens to remaining work.',
    pages: ['pricing', 'website-care', 'seo', 'contact'],
  },
  {
    id: 'payment',
    question: 'How does payment work?',
    answer:
      'Approved fixed-price or subscription packages can be paid securely through Stripe Checkout. For starting-at project packages without an approved fixed Stripe price, we provide an exact quote first—or an explicitly described project deposit when configured. We never collect card numbers on this website.',
    pages: ['pricing', 'contact'],
  },
  {
    id: 'strategy-call',
    question: 'Can I talk to a person before choosing a package?',
    answer:
      'Yes. Use the contact form or request a free strategy conversation. We will help you compare packages based on your goals, timeline, and current website—not pressure you into a specific option.',
    pages: ['home', 'pricing', 'contact'],
  },
];

export function faqsForPage(page: FaqItem['pages'][number]): FaqItem[] {
  return faqs.filter((item) => (item.pages as string[]).includes(page));
}
