import {getInitials} from "../../utils/Helper.jsx";
import {useNavigate} from "react-router-dom";

const ProfileInfo = ({userInfo}) => {
    const navigate = useNavigate();
    const handleLogout = ()=>{
        localStorage.clear();
        navigate("/login");
    }
    return (
        <>
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center rounded-full text-slate-950 font-medium bg-slate-100">
                    {getInitials(userInfo?.fullName)}</div>
                <div>
                    <p className="text-sm font-medium">{userInfo?.fullName}</p>
                    <button className="text-sm text-slate-700 underline cursor-pointer  " onClick={()=> handleLogout()}>LogOut</button>
                </div>
            </div>
        </>
    )
}
export default ProfileInfo