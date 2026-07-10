import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FeedbackPage } from './FeedbackPage'

const mockSessions: Record<string, { id: string; skill: string; session_score: number | null; status: string; created_at: string } | undefined> = {
  s1: { id: 's1', skill: 'shooting', session_score: 74, status: 'complete', created_at: '2026-07-08T00:00:00Z' },
}

vi.mock('../lib/supabase', () => {
  const feedback = [
    { id: 'f1', kind: 'priority_fix', fault_tag: 'shooting_torso_lean', copy: 'Lean forward more.', rank: 0 },
    { id: 'f2', kind: 'win', fault_tag: null, copy: 'Great follow-through.', rank: 0 },
  ]
  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: (_column: string, id: string) => ({
            single: () =>
              table === 'training_sessions'
                ? Promise.resolve(
                    mockSessions[id]
                      ? { data: mockSessions[id], error: null }
                      : { data: null, error: { message: 'not found' } }
                  )
                : undefined,
            order: () => Promise.resolve({ data: table === 'feedback_items' ? feedback : [], error: null }),
          }),
        }),
      }),
    },
  }
})

describe('FeedbackPage', () => {
  beforeEach(() => {
    mockSessions.s1 = { id: 's1', skill: 'shooting', session_score: 74, status: 'complete', created_at: '2026-07-08T00:00:00Z' }
  })

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

  it('shows a retry message and link when the session fails to load', async () => {
    render(
      <MemoryRouter initialEntries={['/feedback/missing']}>
        <Routes><Route path="/feedback/:sessionId" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/Couldn't load this session/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/home')
  })

  it('shows a re-record message instead of feedback when the session status is failed', async () => {
    mockSessions.s1 = { id: 's1', skill: 'shooting', session_score: 74, status: 'failed', created_at: '2026-07-08T00:00:00Z' }
    render(
      <MemoryRouter initialEntries={['/feedback/s1']}>
        <Routes><Route path="/feedback/:sessionId" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(screen.getByText(/couldn't be fully analyzed/i)).toBeInTheDocument()
    )
    expect(screen.queryByText('Lean forward more.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Record a new session/i })).toHaveAttribute('href', '/record')
  })

  it('shows an analyzing message when the session status is analyzing', async () => {
    mockSessions.s1 = { id: 's1', skill: 'shooting', session_score: null, status: 'analyzing', created_at: '2026-07-08T00:00:00Z' }
    render(
      <MemoryRouter initialEntries={['/feedback/s1']}>
        <Routes><Route path="/feedback/:sessionId" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(screen.getByText(/Still analyzing your session/i)).toBeInTheDocument()
    )
  })
})
