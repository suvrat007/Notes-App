import Home from './pages/home/Home.jsx'
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import Login from "./pages/login/Login.jsx";
import SignUp from "./pages/login/SIgnUp.jsx";
import LoginChecker from "./pages/utils/LoginChecker.jsx";



const app = createBrowserRouter([
    {
        path: "/",
        element: <LoginChecker />,
        children: [
            { path: "/", element: <Home /> },
        ],
    },
    { path: "/login", element: <Login /> },
    { path: "/signup", element: <SignUp /> },
])



const App = () => {

    return (
        <div>
            <RouterProvider router={app}/>
        </div>
    )
}

export default App
