# TradeStocko React Frontend

A modern React frontend for the TradeStocko trading platform, built with Vite and Tailwind CSS.

## Features

- 🚀 **Modern React Architecture** - Built with React 18 and modern hooks
- ⚡ **Vite Build Tool** - Lightning-fast development and build times
- 🎨 **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- 🔐 **Authentication** - Secure login with your existing backend API
- 📱 **Responsive Design** - Mobile-first responsive design
- 🎯 **TypeScript Ready** - Easy to migrate to TypeScript if needed

## Tech Stack

- **React 18** - Modern React with hooks
- **Vite** - Next-generation frontend tooling
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Axios** - HTTP client for API calls
- **React Hot Toast** - Beautiful toast notifications

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
│   ├── Login.jsx       # Login page
│   └── Dashboard.jsx   # Dashboard page
├── services/           # API services
│   └── api.js          # API client and endpoints
├── hooks/              # Custom React hooks
│   └── useAuth.js      # Authentication hook
├── utils/              # Utility functions
│   └── deviceUtils.js  # Device ID generation
├── assets/             # Static assets
├── App.jsx             # Main App component
├── main.jsx            # Application entry point
└── index.css           # Global styles
```

## API Integration

The frontend integrates with your existing ASP.NET backend API at:
`https://www.app.tradenstocko.com/api`

### Key API Endpoints Used:

- `POST /checklogin/` - User authentication
- `GET /userprofile/` - Get user profile data
- `GET /getledgerbalance/` - Get account balance
- `GET /getallorders/` - Get trading orders
- `GET /getmarkettime/` - Get market timing data

## Demo Credentials

For testing purposes, you can use these demo credentials:
- **Username:** `Testlogin`
- **Password:** `54321`

## Features Implemented

### ✅ Login Page
- Modern, responsive design
- Form validation
- Loading states
- Error handling
- Demo credentials display

### ✅ Dashboard
- User welcome section
- Account balance display
- Trading statistics
- Trading options (MCX, NSE, CDS)
- Logout functionality

### ✅ Authentication
- Secure login flow
- User session management
- Protected routes
- Automatic redirects

## Next Steps

The foundation is set up for you to continue building:

1. **Trading Components** - Add trading interface components
2. **Portfolio Management** - Build portfolio tracking features
3. **Real-time Data** - Integrate WebSocket for live market data
4. **Order Management** - Add order placement and management
5. **Payment Integration** - Integrate payment features
6. **Mobile Optimization** - Further mobile enhancements

## Backend Integration

This frontend is designed to work seamlessly with your existing ASP.NET backend. The backend remains unchanged and serves as a pure API service.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is part of the TradeStocko trading platform.
# tns-frontend
# tradenstocko_react_app
