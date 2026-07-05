'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface SimulatorUsage {
  simulatorUsed: boolean
  markSimulatorUsed: () => void
}

const SimulatorUsageContext = createContext<SimulatorUsage | null>(null)

export function SimulatorUsageProvider({ children }: { children: ReactNode }) {
  const [simulatorUsed, setSimulatorUsed] = useState(false)
  const markSimulatorUsed = useCallback(() => setSimulatorUsed(true), [])
  const value = useMemo(
    () => ({ simulatorUsed, markSimulatorUsed }),
    [simulatorUsed, markSimulatorUsed]
  )

  return (
    <SimulatorUsageContext.Provider value={value}>
      {children}
    </SimulatorUsageContext.Provider>
  )
}

export function useSimulatorUsage(): SimulatorUsage {
  const context = useContext(SimulatorUsageContext)
  if (!context) {
    throw new Error('SimulatorUsageProvider内で使用してください')
  }
  return context
}
