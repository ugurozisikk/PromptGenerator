import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  Typography,
  alpha,
} from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Dashboard,
  Storage,
  Code,
  Business,
  Phone,
  PhoneIphone,
  Android as AndroidIcon,
  AutoAwesome,
} from '@mui/icons-material'

const drawerWidth = 280

const menuItems = [
  { label: 'MW', path: '/mw', icon: Dashboard },
  { label: 'Backend', path: '/backend', icon: Storage },
  { label: 'DKS FrontEnd', path: '/dks-frontend', icon: Code },
  { label: 'İŞube', path: '/isube', icon: Business },
  { label: 'CallCenter', path: '/callcenter', icon: Phone },
  { label: 'iOS', path: '/ios', icon: PhoneIphone },
  { label: 'Android', path: '/android', icon: AndroidIcon },
]

export const Sidebar = () => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          background: '#ffffff',
          borderRight: '1px solid',
          borderColor: alpha('#000', 0.1),
          boxShadow: 'none',
        },
      }}
    >
      <Toolbar
        sx={{
          minHeight: '64px !important',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        <AutoAwesome 
          sx={{ 
            color: '#1da1f2', 
            fontSize: '1.75rem',
          }} 
        />
        <Typography
          variant="h6"
          sx={{
            color: '#000000',
            fontWeight: 700,
            fontSize: '1.25rem',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          Prompt Generator
        </Typography>
      </Toolbar>
      <Box sx={{ overflow: 'auto', mt: 2 }}>
        <List sx={{ px: 2 }}>
          {menuItems.map((item) => {
            const Icon = item.icon
            const isSelected = location.pathname === item.path
            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    py: 1.25,
                    px: 2,
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    backgroundColor: isSelected
                      ? alpha('#1da1f2', 0.1)
                      : 'transparent',
                    color: isSelected ? '#1da1f2' : '#000000',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    '&:hover': {
                      backgroundColor: alpha('#1da1f2', 0.05),
                      color: '#1da1f2',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 40,
                      color: isSelected ? '#1da1f2' : alpha('#000000', 0.7),
                      transition: 'color 0.2s ease',
                    }}
                  >
                    <Icon />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.9375rem',
                      fontWeight: isSelected ? 700 : 400,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
      </Box>
    </Drawer>
  )
}

