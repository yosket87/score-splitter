import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  SimulatorUsageProvider,
  useSimulatorUsage,
} from '@/features/waitlist-lp/components/simulator-usage-provider'

function Probe() {
  const { simulatorUsed, markSimulatorUsed } = useSimulatorUsage()
  return (
    <button type="button" onClick={markSimulatorUsed}>
      {simulatorUsed ? 'used' : 'unused'}
    </button>
  )
}

describe('SimulatorUsageProvider', () => {
  it('初期値はfalseで、markSimulatorUsedでtrueになる', async () => {
    const user = userEvent.setup()
    render(
      <SimulatorUsageProvider>
        <Probe />
      </SimulatorUsageProvider>
    )

    expect(screen.getByRole('button', { name: 'unused' })).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'used' })).toBeInTheDocument()
  })
})
