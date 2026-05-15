import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the application title', () => {
    render(<App />)
    expect(screen.getByText('The Ultimate CS Study Guide')).toBeInTheDocument()
  })

  it('renders the app shell layout structure', () => {
    render(<App />)
    // Header is present
    expect(screen.getByRole('banner')).toBeInTheDocument()
    // Sidebar navigation is present
    expect(screen.getByRole('complementary', { name: /topic navigation/i })).toBeInTheDocument()
    // Main content area is present
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders the dashboard by default on the root route', async () => {
    render(<App />)
    // Dashboard is lazy-loaded, so we wait for it
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('renders the command palette trigger button', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: /open command palette/i })
    ).toBeInTheDocument()
  })
})
