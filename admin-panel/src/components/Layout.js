import React, { useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,


  Avatar,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Inventory as ProductsIcon,
  Category as CategoriesIcon,
  Store as StoreIcon,
  People as UsersIcon,
  ShoppingCart as OrdersIcon,
  ShoppingBasket as CartsIcon,
  Assessment as AnalyticsIcon,
  AccountCircle as AccountIcon,
  Logout as LogoutIcon,
  Apartment as OrgIcon,
  Public as RegionsIcon,
} from '@mui/icons-material';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 280;

const navigationItems = [
  {
    text: 'Dashboard',
    icon: <DashboardIcon />,
    path: '/',
  },
  {
    text: 'Products',
    icon: <ProductsIcon />,
    path: '/products',
  },
  {
    text: 'Categories',
    icon: <CategoriesIcon />,
    path: '/categories',
  },
  {
    text: 'Stores',
    icon: <StoreIcon />,
    path: '/stores',
  },
  {
    text: 'Organizations',
    icon: <OrgIcon />,
    path: '/organizations',
  },
  {
    text: 'Regions',
    icon: <RegionsIcon />,
    path: '/regions',
  },
  {
    text: 'Users',
    icon: <UsersIcon />,
    path: '/users',
  },
  {
    text: 'Orders',
    icon: <OrdersIcon />,
    path: '/orders',
  },
  {
    text: 'Carts',
    icon: <CartsIcon />,
    path: '/carts',
  },
  {
    text: 'Analytics',
    icon: <AnalyticsIcon />,
    path: '/analytics',
  },
];

const Layout = ({ children }) => {
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleUserMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
  };

  const drawer = (
    <Box>
      {/* Logo/Brand Section */}
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #E5E7EB',
          minHeight: '64px !important',
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: theme.palette.primary.main,
            fontSize: '18px',
          }}
        >
          Made in World
        </Typography>
      </Toolbar>

      {/* Navigation Items */}
      {(() => {
        const role = user?.role || 'User';
        let visible = navigationItems;
        if (role !== 'Admin') {
          // Non-admins: show a minimal set for manufacturer portal
          const allow = new Set(['Dashboard', 'Products', 'Orders']);
          visible = navigationItems.filter(it => allow.has(it.text));
        }
        return (
          <List sx={{ px: 1, py: 2 }}>
            {visible.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <ListItemButton
                  key={item.text}
                  component={NavLink}
                  to={item.path}
                  selected={isActive}
                  sx={{
                    borderRadius: '8px',
                    mb: 0.5,
                    '&.Mui-selected': {
                      backgroundColor: theme.palette.primary.light,
                      color: theme.palette.primary.main,
                      '& .MuiListItemIcon-root': {
                        color: theme.palette.primary.main,
                      },
                      '&:hover': {
                        backgroundColor: theme.palette.primary.light,
                      },
                    },
                    '&:hover': {
                      backgroundColor: '#F3F4F6',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
                      minWidth: '40px',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    sx={{
                      '& .MuiTypography-root': {
                        fontWeight: isActive ? 600 : 400,
                        fontSize: '14px',
                      },
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        );
      })()}

    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontSize: '18px',
            }}
          >
            Admin Panel
          </Typography>

          {/* User Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.email || 'Admin'}
            </Typography>
            <IconButton
              onClick={handleUserMenuOpen}
              size="small"
              sx={{ ml: 1 }}
              aria-controls={anchorEl ? 'user-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={anchorEl ? 'true' : undefined}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                <AccountIcon />
              </Avatar>
            </IconButton>
          </Box>

          {/* User Menu Dropdown */}
          <Menu
            id="user-menu"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            onClick={handleUserMenuClose}
            PaperProps={{
              elevation: 3,
              sx: {
                overflow: 'visible',
                filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                mt: 1.5,
                '& .MuiAvatar-root': {
                  width: 32,
                  height: 32,
                  ml: -0.5,
                  mr: 1,
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem onClick={handleUserMenuClose}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <AccountIcon />
              </Avatar>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {user?.email || 'Admin User'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Administrator
                </Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sign Out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              backgroundColor: theme.palette.background.paper,
              borderRight: '1px solid #E5E7EB',
            },
          }}
        >
          {drawer}
        </Drawer>
        
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              backgroundColor: theme.palette.background.paper,
              borderRight: '1px solid #E5E7EB',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
        }}
      >
        <Toolbar /> {/* Spacer for fixed AppBar */}
        {children}
      </Box>
    </Box>
  );
};

export default Layout;
