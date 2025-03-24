import {useState} from "react";
import {FaRegEye, FaRegEyeSlash} from "react-icons/fa6";

const Password = ({value , onChange , placeholder})=>{
    const[isShowPassword, setShowPassword] = useState(false);
    const toggleShowPassword = () => {
        setShowPassword(!isShowPassword);
    }
    return(
        <div className=" input-box flex items-center bg-transparent border-1  rounded ">
            <input
                value={value}
                onChange={onChange}
            type={isShowPassword?"text":"password"}
            placeholder={placeholder||"Password"}
            className="w-full  bg-transparent  rounded outline-none"/>
            {isShowPassword ?
                (<FaRegEye
                    size={15}
                    className="text-[#2B85FF] cursor-pointer"
                    onClick={()=>toggleShowPassword()}/> ):(<FaRegEyeSlash size={15}
                                   className="text-slate-400 cursor-pointer"
                                   onClick={()=>toggleShowPassword()}/>)}


        </div>
    )
}
export default Password