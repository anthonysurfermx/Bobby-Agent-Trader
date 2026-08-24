// Privacy policy for the Bobby iOS app and bobbyprotocol.xyz.
// Linked from App Store Connect — every claim here must stay true to the
// code (see docs/app-store/app-privacy-answers.md in the ios branch for
// the verified mapping). Update the date whenever the substance changes.
import { Helmet } from 'react-helmet-async';

const EFFECTIVE_DATE = 'August 24, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.18em] text-green-400">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-white/75">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <title>Privacy Policy | Bobby</title>
        <meta name="description" content="Privacy policy for the Bobby iOS app and bobbyprotocol.xyz — no accounts, no tracking, personalization stays on your device." />
      </Helmet>

      <div className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
        <div className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.22em] text-white/40">Bobby Protocol</div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mb-12 font-mono text-xs text-white/40">Effective {EFFECTIVE_DATE}</p>

        <Section title="The short version">
          <p>
            Bobby has no accounts, no ads, no tracking, and no analytics SDKs inside the iOS app.
            Your companion, its name, and your Discipline XP live on your device. When you ask
            about an asset, your question is processed to generate the answer and then discarded —
            we do not store it. We do not sell or share personal data with anyone.
          </p>
        </Section>

        <Section title="What stays on your device (iOS app)">
          <p>
            Everything that personalizes Bobby is stored locally on your iPhone and never uploaded:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your chosen companion and its evolution level</li>
            <li>The agent name, voice, vibe, and aura you configured</li>
            <li>Discipline XP, streaks, and daily progress</li>
          </ul>
          <p>
            Deleting the app deletes all of it. There is no account to close because none exists.
          </p>
        </Section>

        <Section title="What our servers process (and never keep)">
          <p>
            To answer you, the app sends the text of your question (for example, “bitcoin”), the
            text to be spoken aloud, and your device language (English or Spanish) to our backend
            at bobbyprotocol.xyz. This data is processed to produce the analysis or the audio and
            is not stored. Server logs record errors only — never the content of your questions.
          </p>
          <p>
            For abuse prevention, our rate limiter keeps a short-lived counter keyed by a salted
            cryptographic hash of your IP address. The raw address is never written to storage,
            and the hash cannot be reversed into it.
          </p>
        </Section>

        <Section title="Service providers">
          <p>These processors act on our behalf, only to deliver the product:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-white">OpenAI</span> — generates the market analysis and the
              spoken voice from the text we relay. Data sent through the API is not used to train
              their models.
            </li>
            <li>
              <span className="text-white">Microsoft Edge Neural voices</span> — free fallback
              text-to-speech when the primary voice is unavailable.
            </li>
            <li>
              <span className="text-white">Market data sources</span> (OKX, Yahoo Finance) — we
              request public prices and charts; none of your data is sent to them.
            </li>
            <li>
              <span className="text-white">Vercel</span> — hosts our backend and website, with
              standard, short-lived infrastructure request logs.
            </li>
          </ul>
        </Section>

        <Section title="Microphone and speech recognition">
          <p>
            Both are optional and requested only when you tap the microphone. Dictation is
            transcribed with Apple’s on-device speech services; your audio is not uploaded to our
            servers. The entire app works by typing if you prefer to never grant either permission.
          </p>
        </Section>

        <Section title="The website">
          <p>
            bobbyprotocol.xyz uses Vercel Web Analytics — a cookieless, aggregate page-view
            counter that does not identify or track visitors across sites. The website sets no
            advertising or tracking cookies. The iOS app does not include any analytics.
          </p>
        </Section>

        <Section title="What Bobby is not">
          <p>
            Bobby is an educational market-analysis companion. It does not execute trades, hold
            funds or keys, connect to your exchange accounts, or give personalized investment
            advice. Because there are no financial accounts, we never ask for — and cannot
            receive — financial credentials.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Bobby is not directed at children under 13, and we do not knowingly process personal
            information from them. The app has no accounts and collects no personal data from any
            user.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If our data practices ever change, we will update this page and its effective date
            before the change ships. Material changes will be reflected in the App Store listing’s
            privacy details as well.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy: open an issue at{' '}
            <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" className="text-green-400 underline decoration-green-400/40 underline-offset-4 hover:decoration-green-400">
              github.com/anthonysurfermx/Bobby-Agent-Trader
            </a>{' '}
            or reach us through bobbyprotocol.xyz.
          </p>
        </Section>

        <div className="mt-16 border-t border-white/[0.06] pt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/30">
          Bobby · analysis, not advice
        </div>
      </div>
    </div>
  );
}
