import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAxiosInterceptors } from './auth'
import './styles.css'


installAxiosInterceptors()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
