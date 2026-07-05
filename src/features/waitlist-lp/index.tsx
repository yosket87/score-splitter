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
      <main id="main">
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
    </SimulatorUsageProvider>
  )
}
