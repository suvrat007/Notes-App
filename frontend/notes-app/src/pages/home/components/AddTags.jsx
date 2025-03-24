import {MdAdd, MdClose} from "react-icons/md";
import {useState} from "react";

const AddTags = ({tags , setTags})=>{
    const [inputValue, setInputValue] = useState("");
    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    }
    const addNewTag = () => {
        if (inputValue.trim() !== ""){
            setTags([...tags, inputValue.trim()]);
            setInputValue("");
        }
    }
    const handleKeyDown=(e)=>{
        if (e.key === "Enter"){
            addNewTag();
        }
    }
    const handleRemoveTag = (tagToRemove)=>{
        setTags(tags.filter((tag)=> tag !== tagToRemove));
    }
    return (
        <div>
            {tags?.length>0 && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                    {tags.map((tag,key) => (
                        <span key={key} className="flex items-center gap-2 text-sm text-slate-900 bg-slate-100 px-3 py-1 rounded">
                            #{tag}
                            <button onClick={()=>{handleRemoveTag(tag)}}>
                                <MdClose/>
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-4 mt-3">
                <input type="text"
                       placeholder="Add Tags"
                       onChange={handleInputChange}
                       onKeyDown={handleKeyDown}
                       className="text-sm bg-transparent border px-3 py-2 rounded outline-none focus:outline-none"
                       />
                <button
                    onClick={()=>{
                        addNewTag();
                    }}
                    className="w-8 h-8 flex justify-center items-center rounded border border-blue-700 hover:bg-blue-700">
                    <MdAdd className="text-2xl text-blue-700 hover:text-white"/>
                </button>
            </div>
        </div>
    )
}
export default AddTags;