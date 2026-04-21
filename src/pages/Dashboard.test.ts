import React from 'react'
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dashboardState: { current: ReturnType<typeof buildDashboardHookState> } = {
  current: buildDashboardHookState({ loading: true }),
}

const ingresosState: { current: { ingresos: Array<{ socio_cobro: string; fecha: string; monto_cj_noa: number }> } } = {
  current: { ingresos: [] },
}

const sociosState: { current: string[] } = {
  current: [],
}

const previsionalState: { current: ReturnType<typeof buildPrevisionalHookState> } = {
  current: buildPrevisionalHookState(),
}

vi.mock('../hooks/useFinances', () => ({
  useDashboardStats: () => dashboardState.current,
  useIngresos: () => ingresosState.current,
}))

vi.mock('../hooks/useSocios', () => ({
  useSocios: () => sociosState.current,
}))

vi.mock('../hooks/usePrevisional', () => ({
  usePrevisionalStats: () => previsionalState.current,
}))

vi.mock('../components/ActivityFeed', () => ({
  default: () => React.createElement('div', null, 'activity-feed'),
}))

vi.mock('../components/SmartAlerts', () => ({
  default: () => React.createElement('div', null, 'smart-alerts'),
}))

import Dashboard from './Dashboard'

describe('Dashboard', () => {
  beforeEach(() => {
    dashboardState.current = buildDashboardHookState({ loading: true })
    ingresosState.current = { ingresos: [] }
    sociosState.current = []
    previsionalState.current = buildPrevisionalHookState()
  })

  it('renders through a loading transition without changing hook order', () => {
    let renderer!: ReactTestRenderer

    act(() => {
      renderer = create(React.createElement(Dashboard))
    })

    dashboardState.current = buildDashboardHookState({
      loading: false,
      stats: {
        totalCasos: 1,
        casosPorMateria: { Jubilaciones: 1 },
        cobradoMes: 150000,
        porCobrar: 80000,
        flujoNeto: 120000,
      },
    })
    ingresosState.current = {
      ingresos: [{
        socio_cobro: 'Admin',
        fecha: new Date().toISOString().split('T')[0],
        monto_cj_noa: 150000,
      }],
    }
    sociosState.current = ['Admin']
    previsionalState.current = buildPrevisionalHookState({
      stats: {
        totalClientes: 3,
        cobradoTotal: 250000,
      },
    })

    expect(() => {
      act(() => {
        renderer.update(React.createElement(Dashboard))
      })
    }).not.toThrow()

    const headings = renderer.root.findAll((node: ReactTestInstance) => node.type === 'h1')
    expect(headings.some((node: ReactTestInstance) => node.children.join('') === 'Panel de Control')).toBe(true)
  })
})

function buildDashboardHookState(overrides?: {
  loading?: boolean
  stats?: Partial<{
    porCobrar: number
    cobradoMes: number
    flujoNeto: number
    totalCasos: number
    casosPorMateria: Record<string, number>
    cuotasVencidas: number
    sinPagarConsulta: number
    muyInteresantes: number
    nuevosClientes7d: number
    ingresosMes: number
    egresosMes: number
    casosFondosBajos: number
  }>
}) {
  return {
    loading: overrides?.loading ?? false,
    stats: {
      porCobrar: 0,
      cobradoMes: 0,
      flujoNeto: 0,
      totalCasos: 0,
      casosPorMateria: {},
      cuotasVencidas: 0,
      sinPagarConsulta: 0,
      muyInteresantes: 0,
      nuevosClientes7d: 0,
      ingresosMes: 0,
      egresosMes: 0,
      casosFondosBajos: 0,
      ...overrides?.stats,
    },
  }
}

function buildPrevisionalHookState(overrides?: {
  loading?: boolean
  stats?: Partial<{
    totalClientes: number
    porPipeline: Record<string, number>
    porSemaforo: { verde: number; amarillo: number; rojo: number; gris: number }
    cobradoTotal: number
    pendienteTotal: number
    tareasActivas: number
    tareasVencidas: number
    audienciasProximas: number
    clientesPorCaptador: Record<string, number>
    cobradoPorMes: Array<{ mes: string; monto: number }>
  }>
}) {
  return {
    loading: overrides?.loading ?? false,
    stats: {
      totalClientes: 0,
      porPipeline: {},
      porSemaforo: { verde: 0, amarillo: 0, rojo: 0, gris: 0 },
      cobradoTotal: 0,
      pendienteTotal: 0,
      tareasActivas: 0,
      tareasVencidas: 0,
      audienciasProximas: 0,
      clientesPorCaptador: {},
      cobradoPorMes: [],
      ...overrides?.stats,
    },
  }
}