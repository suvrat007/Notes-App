import NavBar from "./components/NavBar.jsx";
import NoteCard from "./NoteCard.jsx";
import {MdAdd} from "react-icons/md";
import {useEffect, useState} from "react";
import AddEditNotes from "./components/AddEditNotes.jsx";
import Modal from "react-modal";
import {useNavigate} from "react-router-dom";
import axiosInstance from "../utils/axiosinstance.js";
import Toast from "../../toastMessage/Toast.jsx";
import EmptyCard from "./components/EmptyCard.jsx";
import reactImg from "../../assets/react.svg";


const Home = () => {

    const [openAddEditModal, setOpenAddEditModal] = useState({
        isShown: false,
        type:"add",
        data: null
    });
    const [isSearch, setIsSearch] = useState(false);
    const [showToastMsg, setToastMsg] = useState({
        isShown: false,
        message: "",
        type:"add",
    });
    const [userInfo, setUserInfo] = useState(null);
    const [allNotes, setAllNotes] = useState([]);
    const navigate = useNavigate();

    const handleEdit = (noteDetails) =>{
        setOpenAddEditModal({
            isShown: true,
            data:noteDetails,
            type:"edit",
        })
    }

    const handleCloseToast = () => {
        setToastMsg({
            isShown: false,
            message: "",
        })
    }

    const showToastMessage = (message , type) => {
        setToastMsg({
            isShown: true, // Set to true so it actually appears
            message,
            type
        });

        setTimeout(() => {
            setToastMsg({
                isShown: false,
                message: "",
                type: ""
            });
        }, 3000);
    }

    const getAllNotes = async () => {
        try{
            const response = await axiosInstance.get("/get-all-notes");
            console.log(response?.data);

            if(response?.data && response?.data?.notes){
                setAllNotes(response?.data?.notes);
            }
        }catch(error){
            console.log("An unexpected error occured.");
        }
    }

    const getUserInfo = async () => {
        try{
            const response = await axiosInstance.get("/get-user");
            if(response.data && response.data.user){
                setUserInfo(response.data.user);
            }
        }catch(error){
            if(error.response && error.response.data && error.response.data.message){
                localStorage.clear();
                navigate('/login');
            }
        }
    }

    // Delete Note
    const deleteNote = async (noteData) => {
        const noteId = noteData._id
        try{
            const response = await axiosInstance.delete("/delete-note/" + noteId);

            if(response.data && !response.data.error){
                showToastMessage("Note Deleted Successfully","delete");
                getAllNotes()
            }
        }catch(error){
            if(error.response && error.response.data && error.response.data.message){
                setError(error.response.data.message);
            }

        }
    }

    // search for note (not working)
    const onSearchNotes = async (query) => {
        try{
            const response = await axiosInstance.get("/search-notes", {
                params: {query},
            });
            if(response.data && response.data.notes){
                setIsSearch(true);
                setAllNotes(response.data.notes);
            }
        }
        catch(error){
            console.log("An unexpected error occured.");
        }
    }

    const handleClearSearch = () => {
        setIsSearch(false);
        getAllNotes();
    }

    const updateIsPinned = async(notesData) => {
        const noteId = notesData._id
        try{
            const response = await axiosInstance.put("/update-note-pinned/" + noteId,{
                "isPinned": !noteId.isPinned,
            });

            if(response.data && response.data.note){
                showToastMessage("Note Updated Successfully","update");
                getAllNotes()
            }
        }catch(e){
            console.log(e)

        }
    }


    useEffect(() => {
        getAllNotes()
        getUserInfo()
        return()=> { }
    }, []);



    return (
        <>

            <NavBar userInfo={userInfo}
                    onSearchNotes={onSearchNotes} handleClearSearch={handleClearSearch}/>
            <div className="w-[85%] mx-auto">
                {allNotes.length>0 ?(<div className="grid grid-cols-3 gap-5 mt-8">
                    {allNotes.map((item,index)=>(
                        <NoteCard title={item.title}
                                  content={item.content}
                                  date={item.createdOn}
                                  isPinned={item.isPinned}
                                  onPinNote={() => {updateIsPinned(item)}}
                                  onDelete={() => {deleteNote(item)}}
                                  onEdit={() => {handleEdit(item)}}
                                  tags={item.tags}
                                  key={item._id}
                        />
                    ))}
                </div>) : (
                    <EmptyCard message={isSearch ? 'Oops! No notes Found':"Start creating your first note! Click the 'Add' button to jot down your thoughts, ideas, and reminders, let's get started! "} imgSrc={reactImg}/>
                    )}

                <button className="w-16 h-16 flex items-center justify-center rounded-2xl bg-[#2B85FF] hover:bg-blue-600 absolute right-10 bottom-10"
                        onClick={()=>{setOpenAddEditModal({isShown: true, type:"add", data:null})}}>
                    <MdAdd className="text-[32px] text-white "/>
                </button>

                <Modal isOpen={openAddEditModal.isShown}
                       onRequestClose={()=>{}}
                       style={{
                           overlay:{
                               backgroundColor: "rgba(0,0,0,0.2)",
                           },
                       }}
                       contentLabel=""
                       className="w-[40%] max-h-3/4 bg-white rounded-md mx-auto mt-14 p-5 overflow-scroll">
                    <AddEditNotes type={openAddEditModal.type}
                                  noteData={openAddEditModal.data}
                                  onClose={()=>{
                                      setOpenAddEditModal(
                                          {isShown: false, type:"add", data:null})
                                  }}
                                  getAllNotes={getAllNotes}
                                  showToastMessage={showToastMessage}
                    />
                </Modal>
                <Toast isShown={showToastMsg?.isShown}
                       message={showToastMsg?.message}
                       type={showToastMsg?.type}
                       onClose={handleCloseToast} />

            </div>
        </>
    )
}
export default Home