import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'
import { RequireAuth } from './routes/RequireAuth'
import { NavBar } from './routes/NavBar'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { HomePage } from './screens/HomePage'
import { RecordPage } from './screens/RecordPage'
import { FeedbackPage } from './screens/FeedbackPage'
import { ProgressPage } from './screens/ProgressPage'
import { PlanPage } from './screens/PlanPage'
import { ProfilePage } from './screens/ProfilePage'

function AppShell() {
  return (
    <>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/feedback/:sessionId" element={<FeedbackPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <NavBar />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
