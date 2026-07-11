import { SimulatorUsageProvider } from './components/simulator-usage-provider'
import { Hero } from './components/hero'
import { YamawakeFlow } from './components/yamawake-flow'
import { SettlementSimulator } from './components/settlement-simulator'
import { ProblemSection } from './components/problem-section'
import { WhySection } from './components/why-section'
import { FeatureSection } from './components/feature-section'
import { SignupSection } from './components/signup-section'
import { FaqSection } from './components/faq-section'
import { LpFooter } from './components/lp-footer'

export function WaitlistLp() {
  return (
    <SimulatorUsageProvider>
      <main id="main" className="pb-20 sm:pb-0">
        <Hero />
        <YamawakeFlow />
        <SettlementSimulator />
        <ProblemSection />
        <WhySection />
        <FeatureSection />
        <SignupSection />
        <FaqSection />
      </main>
      <LpFooter />
      <MobileSignupCta />
    </SimulatorUsageProvider>
  )
}

function MobileSignupCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:hidden">
      <a
        href="#signup"
        className="mx-auto flex min-h-12 max-w-sm items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-fab transition-colors hover:bg-accent/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        ウェイトリストに登録
      </a>
    </div>
  )
}
