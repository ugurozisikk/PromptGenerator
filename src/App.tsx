import { Box } from '@mui/material'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PromptProvider } from './contexts/PromptContext'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { Home } from './pages/Home'
import { MW } from './pages/MW'
import { Backend } from './pages/Backend'
import { DKSFrontEnd } from './pages/DKSFrontEnd'
import { ISube } from './pages/ISube'
import { CallCenter } from './pages/CallCenter'
import { iOS as IOSPage } from './pages/iOS'
import { Android } from './pages/Android'

function AppContent() {

  return (
    <>
      <Header />
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: '70px',
          width: { sm: `calc(100% - 280px)` },
          backgroundColor: '#ffffff',
          minHeight: 'calc(100vh - 70px)',
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mw" element={<MW />} />
          <Route path="/backend" element={<Backend />} />
          <Route path="/dks-frontend" element={<DKSFrontEnd />} />
          <Route path="/isube" element={<ISube />} />
          <Route path="/callcenter" element={<CallCenter />} />
          <Route path="/ios" element={<IOSPage />} />
          <Route path="/android" element={<Android />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <PromptProvider>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <AppContent />
        </Box>
      </PromptProvider>
    </BrowserRouter>
  )
}

export default App

