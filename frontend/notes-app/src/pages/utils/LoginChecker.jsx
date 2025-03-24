import {Navigate, Outlet} from "react-router-dom";
import Login from "../login/Login.jsx";
import SignUp from "../login/SIgnUp.jsx";


const LoginChecker = () => {
    const checkLoggedIn = () => {
        return localStorage.getItem("token") !== null;
    }
    console.log(checkLoggedIn());
    return (
        <div>
            {checkLoggedIn() ? <Outlet/> :<Navigate to="/login" replace />}
        </div>
    )
}
export default LoginChecker;