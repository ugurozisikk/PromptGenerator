import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  alpha,
  Button,
} from '@mui/material'
import { useLocation } from 'react-router-dom'
import { AutoAwesome } from '@mui/icons-material'
import { usePrompt } from '../../contexts/PromptContext'

const getPageTitle = (pathname: string) => {
  const titles: Record<string, string> = {
    '/': 'Ana Sayfa',
    '/mw': 'MW',
    '/backend': 'Backend',
    '/dks-frontend': 'DKS FrontEnd',
    '/isube': 'İŞube',
    '/callcenter': 'CallCenter',
    '/ios': 'iOS',
    '/android': 'Android',
  }
  return titles[pathname] || 'Prompt Generator'
}

export const Header = () => {
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)
  const { triggerPrompt } = usePrompt()

  return (
    <AppBar
      position="fixed"
      sx={{
        width: { sm: `calc(100% - 280px)` },
        ml: { sm: `280px` },
        zIndex: (theme) => theme.zIndex.drawer + 1,
        background: '#ffffff',
        boxShadow: 'none',
        borderBottom: 'none',
      }}
    >
      <Toolbar
        sx={{
          minHeight: '64px !important',
          px: { xs: 2, sm: 3 },
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(29, 161, 242, 0.3)',
            }}
          >
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%)',
                }}
              />
            </Box>
          </Box>
          <Box>
            <Typography
              variant="h6"
              sx={{
                color: '#000000',
                fontWeight: 700,
                fontSize: '1.125rem',
                lineHeight: 1.2,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              {pageTitle}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: alpha('#000000', 0.6),
                fontSize: '0.75rem',
                fontWeight: 400,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              {location.pathname === '/' ? 'Hoş geldiniz' : 'Sayfa içeriği'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<AutoAwesome />}
          onClick={triggerPrompt}
          sx={{
            backgroundColor: alpha('#000', 0.85),
            borderRadius: '6px',
            textTransform: 'none',
            fontWeight: 500,
            px: 2.5,
            py: 0.75,
            fontSize: '0.875rem',
            boxShadow: 'none',
            ml: 'auto',
            '&:hover': {
              backgroundColor: alpha('#000', 0.95),
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            },
          }}
        >
          Prompt Üret
        </Button>
      </Toolbar>
    </AppBar>
  )
}

