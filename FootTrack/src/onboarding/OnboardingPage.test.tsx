import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from './OnboardingPage'

const updateMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({ update: (vals: unknown) => { updateMock(vals); return { eq: () => Promise.resolve({ error: null }) } } }),
  },
}))

describe('OnboardingPage', () => {
  it('requires accepting consent before submitting', () => {
    render(<OnboardingPage />, { wrapper: MemoryRouter })
    const submit = screen.getByRole('button', { name: /start training/i })
    expect(submit).toBeDisabled()
  })

  it('enables submit once dominant foot is chosen and consent is checked', () => {
    render(<OnboardingPage />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText(/right foot/i))
    fireEvent.click(screen.getByLabelText(/i confirm i am 16/i))
    expect(screen.getByRole('button', { name: /start training/i })).toBeEnabled()
  })

  it('submits the profile update with the selected values on save', async () => {
    render(<OnboardingPage />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText(/right foot/i))
    fireEvent.click(screen.getByLabelText(/i confirm i am 16/i))
    fireEvent.click(screen.getByRole('button', { name: /start training/i }))

    await waitFor(() => expect(updateMock).toHaveBeenCalled())

    expect(updateMock).toHaveBeenCalledWith({
      dominant_foot: 'right',
      position: null,
      consent_accepted_at: expect.any(String),
    })
  })
})
