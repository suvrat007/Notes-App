import NavBar from "../home/components/NavBar.jsx";
import Password from "./Password.jsx";
import {Link, useNavigate} from "react-router-dom";
import {useState} from "react";
import {validateEmail} from "../utils/Helper.jsx";
import axiosInstance from "../utils/axiosinstance.js";
import LoginNav from "../home/components/LoginNav.jsx";

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!password){
            setError("Enter Password");
        }
        if(!email){
            setError("Enter Email");
        }
        if (!validateEmail(email)){
            setError("Please enter a valid email");
            return;
        }
        setError("")

        // login api call
        try{
            const response = await axiosInstance.post("/login", {
                email: email,
                password: password,
            })
            // handle successful login response
            if(response.data && response.data.accessToken){
                localStorage.setItem("token", response.data.accessToken);
                navigate('/');
            }
        }catch(error){
            if(error.response && error.response.data && error.response.data.message){
                setError(error.response.data.message);
            }else{
                setError("An Unexpected error occured. Please try again.");
            }
        }

    }
    return (
        <>
            <LoginNav/>
            <div className="flex items-center justify-center mt-28 ">
                <div className='w-95 border rounded bg-white px-7 py-10'>
                    <form onSubmit={handleLogin}>
                        <h4 className={'text-2xl mb-7'}>LogIn</h4>

                        <input type="text"
                               value={email}
                               placeholder="Enter your email"
                               className="input-box"
                               onChange={(e) => setEmail(e.target.value)}/>

                        <Password value={password}
                                  onChange={(e) => setPassword(e.target.value)}/>

                        {error && <p className="text-red-500 text-xs pb-1">{error}</p>}
                        <button type="submit" className="btn-primary">Login</button>
                        <p className={'text-sm text-centre mt-4'}>
                            <Link to="/signup" className={'font-medium text-primary underline'}>
                                Not Registered Yet? SignUp Now!!
                            </Link>

                        </p>
                    </form>
                </div>
            </div>

        </>
    )
}
export default Login