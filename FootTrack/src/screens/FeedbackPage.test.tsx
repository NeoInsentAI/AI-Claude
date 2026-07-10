import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FeedbackPage } from './FeedbackPage'

vi.mock('../lib/supabase', () => {
  const session = { id: 's1', skill: 'shooting', session_score: 74, created_at: '2026-07-08T00:00:00Z' }
  const feedback = [
    { id: 'f1', kind: 'priority_fix', fault_tag: 'shooting_torso_lean', copy: 'Lean forward more.', rank: 0 },
    { id: 'f2', kind: 'win', fault_tag: null, copy: 'Great follow-through.', rank: 0 },
  ]
  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => (table === 'training_sessions' ? Promise.resolve({ data: session, error: null }) : undefined),
            order: () => Promise.resolve({ data: table === 'feedback_items' ? feedback : [], error: null }),
          }),
        }),
      }),
    },
  }
})

describe('FeedbackPage', () => {
  it('shows the session score and the priority fix before other feedback', async () => {
    render(
      <MemoryRouter initialEntries={['/feedback/s1']}>
        <Routes><Route path="/feedback/:sessionId" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('74')).toBeInTheDocument())
    expect(screen.getByText('Lean forward more.')).toBeInTheDocument()
    expect(screen.getByText('Great follow-through.')).toBeInTheDocument()
  })
})
