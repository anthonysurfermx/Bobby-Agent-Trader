import { Helmet } from 'react-helmet-async';

type LegalSection = {
  title: string;
  body: string[];
};

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'What this policy covers',
    body: [
      'This policy explains how Bobby Protocol and DeFi México (together, “Bobby”, “we”, “us”) handle information when you use the Bobby app, website, or related services.',
      'Bobby is an intelligence and record-keeping product. It does not custody funds, place trades, or access a brokerage or exchange account unless a future feature clearly asks you to connect one.',
    ],
  },
  {
    title: 'Information you choose to provide',
    body: [
      'Depending on the feature you use, this can include a name or account details, the market questions and watchlists you send to Bobby, optional voice input, and a wallet address if you choose to connect a wallet.',
      'Voice input is processed only when you actively use a voice feature. Do not include sensitive personal, financial, or account credentials in a prompt.',
    ],
  },
  {
    title: 'Technical and usage information',
    body: [
      'We may receive limited technical information needed to operate and protect the service, such as device and browser type, IP-derived region, app version, pages or features used, crash diagnostics, and security logs.',
      'We use this information to keep Bobby reliable, measure feature performance, prevent abuse, and improve the app. We do not sell or rent personal information.',
    ],
  },
  {
    title: 'How we use and share information',
    body: [
      'We use information to provide the service, respond to requests, maintain a public decision record where a feature says it is public, secure the platform, and comply with law.',
      'We may use vetted infrastructure, analytics, AI, and communications providers to operate Bobby. They may process information only on our instructions and for the service. We may also disclose information when required by law or to protect users, Bobby, or the public.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can choose not to provide optional information and can stop using voice input at any time. You may ask to access, correct, delete, or export personal information we hold about you, subject to legal and security limits.',
      'To make a privacy request, email hola@defimexico.org from the address connected to your request. We may need to verify your identity before acting on it.',
    ],
  },
  {
    title: 'Retention and security',
    body: [
      'We retain information only for as long as reasonably necessary for the purposes described here, including security, dispute resolution, and legal obligations. Public decision records may remain visible because their purpose is accountability.',
      'No internet service is perfectly secure. Please protect your device, wallet, and credentials, and never send private keys or passwords to Bobby.',
    ],
  },
  {
    title: 'Children and changes',
    body: [
      'Bobby is not intended for children under 18. If you believe a child has provided personal information, contact us so we can investigate.',
      'We may update this policy as the app evolves. We will publish the updated version here and change the “Last updated” date.',
    ],
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'What Bobby is',
    body: [
      'Bobby provides AI-assisted market intelligence, adversarial review, and decision records. It is a tool for research and verification — not a broker, exchange, custodian, investment adviser, or fiduciary.',
      'Bobby does not hold your money, place orders, or guarantee a result. You are solely responsible for every financial decision and transaction you make.',
    ],
  },
  {
    title: 'No financial advice',
    body: [
      'Anything produced by Bobby — including a score, verdict, analysis, voice response, price level, or record — is general information, not investment, legal, tax, or financial advice. A favorable verdict is not a recommendation to buy, sell, or hold an asset.',
      'Markets are risky. You can lose some or all of any capital you choose to put at risk. Do your own research and consult qualified professionals where appropriate.',
    ],
  },
  {
    title: 'Your use of the service',
    body: [
      'You must be at least 18 and able to enter a binding agreement to use Bobby. You are responsible for the information, prompts, and wallet addresses you submit, and for keeping your devices and credentials secure.',
      'Do not use Bobby to break the law, mislead others, attempt to access another person’s account, interfere with the service, scrape it without permission, or submit malware, private keys, passwords, or unlawful content.',
    ],
  },
  {
    title: 'AI and public records',
    body: [
      'AI outputs can be incomplete, delayed, inaccurate, or unavailable. You should independently verify material information before acting on it.',
      'Some features intentionally create a visible decision record before an outcome is known. When you choose a public-record feature, you understand that the relevant decision data may be displayed to other users or recorded on public infrastructure.',
    ],
  },
  {
    title: 'Availability and changes',
    body: [
      'We may change, pause, or discontinue features at any time, including experimental or beta features. We do not promise that Bobby will always be available, uninterrupted, or error-free.',
      'We may update these terms as the app evolves. Continued use after the updated terms take effect means you accept them.',
    ],
  },
  {
    title: 'Contact',
    body: [
      'Questions about these terms can be sent to hola@defimexico.org. For how Bobby handles personal information, read the Privacy Policy.',
    ],
  },
];

export function BobbyLegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <div className="min-h-screen bg-[#07070a] text-white">
      <Helmet>
        <title>{`${title} — Bobby`}</title>
        <meta name="description" content={`${title} for the Bobby app and Bobby Protocol.`} />
      </Helmet>

      <header className="border-b border-white/10 bg-[#07070a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Back to Bobby">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[radial-gradient(circle_at_30%_20%,#c9a8ff_0%,#7c52ff_30%,#2670ff_100%)] text-lg font-black">B</span>
            <span className="font-bold tracking-[-.04em]">Bobby</span>
          </a>
          <a href={isPrivacy ? '/terms' : '/privacy'} className="font-mono text-[11px] uppercase tracking-[.15em] text-white/55 transition hover:text-white">
            {isPrivacy ? 'Terms' : 'Privacy'}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-24">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#c3aaff]">Bobby app / legal</p>
        <h1 className="mt-5 text-5xl font-extrabold tracking-[-.07em] md:text-7xl">{title}</h1>
        <p className="mt-6 font-mono text-xs uppercase tracking-[.14em] text-white/40">Last updated: August 23, 2026</p>
        <p className="mt-10 max-w-2xl text-lg leading-8 text-white/65">Clear language, because the important part should not be hidden in a wall of text.</p>

        <div className="mt-16 border-t border-white/10">
          {sections.map((section, index) => (
            <section key={section.title} className="grid gap-4 border-b border-white/10 py-9 md:grid-cols-[4rem_1fr] md:gap-8">
              <span className="font-mono text-xs text-[#c3aaff]">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="text-2xl font-bold tracking-[-.04em]">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-white/55 md:text-base">
                  {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/10 px-5 py-10 text-center font-mono text-[11px] uppercase tracking-[.15em] text-white/35">
        <a href="/" className="transition hover:text-white">Back to Bobby</a>
      </footer>
    </div>
  );
}
