import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import Dashboard from './pages/Dashboard/Dashboard';
import { useAuth } from './utils/AuthContext';
import ColdStart from './components/ColdStart';

const PrivateRoute = ({ children }) => {
  const { status } = useAuth();
  // The backend sleeps when idle and can take most of a minute to wake, so
  // this gate is the longest wait in the app, not the shortest.
  if (status === 'loading') return <ColdStart />;
  return status === 'authenticated' ? children : <Navigate to="/login" />;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
