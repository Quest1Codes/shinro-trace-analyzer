import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider } from './context/ConnectionContext';
import { TraceProvider } from './context/TraceContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConversationProvider } from './context/ConversationContext';
import AppLayout from './components/AppLayout';
import './styles/theme.css';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ConnectionProvider>
          <TraceProvider>
            <ConversationProvider>
              <Routes>
                <Route path="/" element={<AppLayout />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ConversationProvider>
          </TraceProvider>
        </ConnectionProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
