import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

import { pigeonSocial, UserProfile } from './services/pigeonSocial'
import { friendService } from './services/friendService'
import { WelcomeScreen } from './components/WelcomeScreen'
import { MainFeed } from './components/MainFeed'
import { LoadingScreen } from './components/LoadingScreen'
import { NotificationProvider } from './contexts/NotificationContext'

export function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [isFirstTime, setIsFirstTime] = useState(false)

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    try {
      // Configure native app if running on mobile
      if (Capacitor.isNativePlatform()) {
        await StatusBar.setStyle({ style: Style.Default })
        await StatusBar.setBackgroundColor({ color: '#3b82f6' })
      }

      // Initialize friend service (this will connect to signaling server)
      console.log('🔗 Initializing friend service...')
      
      // Just accessing the friendService will trigger its constructor
      console.log('Friend service connected:', friendService.isConnectedToSignaling())

      // Initialize PeerPigeon and check for existing user
      const user = await pigeonSocial.getCurrentUser()
      const firstTime = await pigeonSocial.isFirstTimeUser()
      
      setCurrentUser(user)
      setIsFirstTime(firstTime)

      // Initialize friend service after user is loaded
      if (user) {
        console.log('🔗 Initializing friend service for user:', user.username)
        await friendService.initialize()
      }
    } catch (error) {
      console.error('Failed to initialize app:', error)
    } finally {
      setIsLoading(false)
      
      // Hide splash screen if on native platform
      if (Capacitor.isNativePlatform()) {
        await SplashScreen.hide()
      }
    }
  }

  const handleUserCreated = async (user: UserProfile) => {
    setCurrentUser(user)
    setIsFirstTime(false)
    
    // Initialize friend service for new user
    console.log('🔗 Initializing friend service for new user:', user.username)
    await friendService.initialize()
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setIsFirstTime(true)
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <NotificationProvider>
      <Router future={{ v7_relativeSplatPath: true }}>
        <div className="min-h-screen bg-slate-900">
          <Routes>
            <Route 
              path="/" 
              element={
                isFirstTime || !currentUser ? (
                  <WelcomeScreen onUserCreated={handleUserCreated} />
                ) : (
                  <Navigate to="/feed" replace />
                )
              } 
            />
            <Route 
              path="/feed" 
              element={
                currentUser ? (
                  <MainFeed user={currentUser} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/" replace />
                )
              } 
            />
          </Routes>
        </div>
      </Router>
    </NotificationProvider>
  )
}
