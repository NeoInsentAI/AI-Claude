import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'
import { RequireAuth } from './routes/RequireAuth'
import { NavBar } from './routes/NavBar'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { HomePage } from './screens/HomePage'
import { FeedbackPage } from './screens/FeedbackPage'
import { ProgressPage } from './screens/ProgressPage'
import { PlanPage } from './screens/PlanPage'
import { ProfilePage } from './screens/ProfilePage'

// Lazy-loaded: RecordPage pulls in @mediapipe/tasks-vision (the pose-detection/analysis pipeline), which is
// large and only needed by users who actually open the Record screen. Splitting it into its own chunk keeps
// it out of the main entry bundle for everyone else.
const RecordPage = lazy(() => import('./screens/RecordPage').then((m) => ({ default: m.RecordPage })))

function AppShell() {
  const { session } = useAuth()

  return (
    <>
      <Suspense fallback={<p>Loading…</p>}>
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
      </Suspense>
      {session && <NavBar />}
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
