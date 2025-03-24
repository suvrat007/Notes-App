import {useState} from "react";
import {validateEmail} from "../utils/Helper.jsx";
import NavBar from "../home/components/NavBar.jsx";
import Password from "./Password.jsx";
import {Link, useNavigate} from "react-router-dom";
import axiosInstance from "../utils/axiosinstance.js";
import LoginNav from "../home/components/LoginNav.jsx";

const SignUp = () => {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);

    const navigate = useNavigate();
    const handleSignin = async (e) => {
        e.preventDefault();
        if(!name){
            setError("Enter Name");
            return;
        }
        if (!password){
            setError("Enter Password");
            return;
        }
        if(!email){
            setError("Enter Email");
            return;
        }

        if (!validateEmail(email)){
            setError("Please enter a valid email");
            return;
        }
        setError("")
        // SignUp api call
        try{
            const response = await axiosInstance.post("/create-account", {
                fullName: name,
                email: email,
                password: password,
            })
            if(response.data&& response.data.error){
                setError(response.data.error)
                return
            }

            // handle successful regitraion response
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
                    <form onSubmit={handleSignin}>
                        <h4 className={'text-2xl mb-7'}>SignIn</h4>

                        <input type="text"
                               value={name}
                               placeholder="Enter your Name"
                               className="input-box"
                               onChange={(e) => setName(e.target.value)}/>


                        <input type="text"
                               value={email}
                               placeholder="Enter your email"
                               className="input-box"
                               onChange={(e) => setEmail(e.target.value)}/>

                        <Password value={password}
                                  onChange={(e) => setPassword(e.target.value)}/>

                        {error && <p className="text-red-500 text-xs pb-1">{error}</p>}
                        <button type="submit" className="btn-primary">Create Account</button>
                        <p className={'text-sm text-centre mt-4'}>
                            <Link to="/login" className={'font-medium text-primary underline'}>
                                Already have an account? LogIn Now !!
                            </Link>

                        </p>
                    </form>
                </div>
            </div>

        </>
    )
}
export default SignUp