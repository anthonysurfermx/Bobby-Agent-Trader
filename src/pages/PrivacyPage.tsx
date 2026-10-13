// Privacy policy for the Bobby iOS app and bobbyprotocol.xyz.
// Linked from App Store Connect — every claim here must stay true to the
// code (see docs/app-store/app-privacy-answers.md in the ios branch for
// the verified mapping). Update the date whenever the substance changes.
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';

const EFFECTIVE_DATE = 'September 4, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-white/75">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <ProtocolLayout active="privacy" title="Your privacy." eyebrow="Bobby / Privacy" description="What stays with you, what Bobby processes, and the choices you control." wide={false}>
      <Helmet>
        <title>Privacy Policy | Bobby</title>
        <meta name="description" content="Privacy policy for the Bobby iOS app and bobbyprotocol.xyz — optional accounts and wallets, synced progress, non-custodial swaps, and no cross-app tracking." />
      </Helmet>

      <div className="protocol-prose">
        <p className="protocol-eyebrow mb-5">Privacy Policy · Effective {EFFECTIVE_DATE}</p>

        <Section title="The short version">
          <p>
            Bobby has no ads and does not track you across apps or websites. You may use an
            optional Sign in with Apple account to sync progress and an optional external wallet
            for non-custodial Base swaps. Bobby never receives your wallet keys, takes custody of
            funds, or signs a transaction for you. We do not sell personal data.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            Your creative profile stays locally on your iPhone:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your chosen companion and its evolution level</li>
            <li>The agent name, voice, vibe, and aura you configured</li>
          </ul>
          <p>
            XP, streaks, gear, and other progress also start on your device. If you choose Sign in
            with Apple, that progress is sent to Bobby so it can survive a reinstall and follow you
            between the app and website.
          </p>
        </Section>

        <Section title="Accounts and synced progress">
          <p>
            Sign in with Apple is optional. When you use it, Apple and our authentication provider
            give Bobby an account identifier and session credentials. Bobby stores an internal user
            ID together with the progress you choose to sync, such as Discipline XP, streaks,
            awards, gear, and Trader Land state. We do not require your real name or email address.
          </p>
        </Section>

        <Section title="Wallets and Base swaps">
          <p>
            Connecting a wallet is optional and separate from your Apple account. Reown AppKit
            helps your chosen external wallet connect to Bobby. Bobby processes your public wallet
            address, a signed proof that you control it, and the quote and transaction data needed
            for the swap you request. The wallet shows the final transaction and only you can sign it.
          </p>
          <p>
            For security, history, and reconciliation, we retain prepared and confirmed swap data:
            public wallet address, token pair, amounts, route, calldata hash, transaction hash, and
            confirmation details. Blockchain transactions are public and cannot be erased by Bobby.
            Where a receipt is linked to an Apple account, account deletion removes that account
            link; the public wallet and transaction record may remain for security, audit, and legal
            purposes.
          </p>
          <p>
            Country is inferred at the network edge to decide whether a restricted feature is
            available. Bobby does not store that country in your swap receipt.
          </p>
        </Section>

        <Section title="Questions, voice, and operational data">
          <p>
            To answer or speak, the app sends the text you provide, recent conversation context,
            requested voice, and language to our backend and the relevant AI or speech provider.
            Bobby processes this content for the request and does not add it to your account or
            retain a conversation history on its servers. Your device keeps the visible transcript.
          </p>
          <p>
            Infrastructure providers may create short-lived request and error logs. For abuse and
            cost prevention, Bobby stores short-lived counters keyed by salted cryptographic hashes
            of network or device identifiers instead of storing the raw values in those counters.
          </p>
        </Section>

        <Section title="Service providers">
          <p>These processors act on our behalf, only to deliver the product:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><span className="text-white">Apple</span> — Sign in with Apple and optional speech recognition.</li>
            <li><span className="text-white">Supabase</span> — authentication, synced progress, and product records.</li>
            <li><span className="text-white">Reown</span> — connection to your chosen external wallet; analytics are disabled in the iOS app.</li>
            <li><span className="text-white">Base and Uniswap</span> — public blockchain and swap-router infrastructure.</li>
            <li><span className="text-white">OpenAI, ElevenLabs, and Microsoft</span> — AI analysis or speech processing, depending on the requested feature and availability.</li>
            <li>
              <span className="text-white">Public market data sources</span> — we
              request public prices and charts using an asset symbol and timeframe, without your
              account or wallet identifiers.
            </li>
            <li>
              <span className="text-white">Vercel</span> — hosts our backend and website, with
              standard, short-lived infrastructure request logs.
            </li>
          </ul>
        </Section>

        <Section title="Microphone and speech recognition">
          <p>
            Both are optional and requested only when you tap the microphone. Dictation uses
            Apple’s on-device speech recognition whenever your device and language support it.
            Where on-device recognition is unavailable, Apple transcribes the audio on its own
            servers. Either way the audio never reaches Bobby’s servers — we receive only the
            transcribed text. The entire app works by typing if you prefer to never grant either
            permission.
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
            Bobby is market-analysis software, not a broker, exchange, custodian, or investment
            adviser. It can prepare a non-custodial Base swap transaction, but cannot execute it
            without your review and signature in an external wallet. Bobby does not receive seed
            phrases, private keys, exchange passwords, or custody of your assets.
          </p>
        </Section>

        <Section title="Retention and your choices">
          <p>
            Local data remains until you remove it or delete the app. Account and synced progress
            remain until you delete the account. Confirmed public-chain data and limited records
            needed for fraud prevention, security, audit, legal compliance, or dispute resolution
            may remain after account deletion. Service providers keep operational data under their
            own retention terms.
          </p>
          <p>
            To delete an Apple account and its synced Bobby progress, open Bobby on iOS, choose
            Account, then “Delete account and synced progress.” You can also request access or
            deletion help through the contact below. Signing out alone does not delete the account.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Bobby and its tokenized-asset features are not directed at children under 18. We do
            not knowingly allow children to create accounts or use restricted financial features.
            If you believe a child provided personal data, contact us so we can investigate and
            delete it where applicable.
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
            <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" className="underline underline-offset-4">
              github.com/anthonysurfermx/Bobby-Agent-Trader
            </a>{' '}
            or reach us through bobbyprotocol.xyz.
          </p>
        </Section>

      </div>
    </ProtocolLayout>
  );
}
