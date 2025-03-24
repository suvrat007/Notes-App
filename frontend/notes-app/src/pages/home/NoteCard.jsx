import {MdOutlinePushPin} from "react-icons/md";
import {MdCreate , MdDelete} from "react-icons/md";
import AddEditNotes from "./components/AddEditNotes.jsx";
import moment from "moment/moment.js";

const NoteCard = ({title,
                      date,
                      content,
                      isPinned,
                      onPinNote ,
                      onEdit,
                      onDelete,
                      tags}) =>
{
    return (
        <div className="border rounded p-4 bg-white hover:shadow-xl transition-all ease-in-out">
            <div className="flex items-center justify-between">
                <div>
                    <h6 className="text-sm font-medium">{title}</h6>
                    <span className="text-xs text-slate-500">{moment(date).format('DD MMM YYYY')}</span>
                </div>
                <MdOutlinePushPin onClick={onPinNote} className={`icon-btn ${isPinned ? 'text-[#2B85FF] ' : 'text-slate-300'}`}/>
            </div>
            <p className="text-xs text-slate-500">{content?.slice(1,60)}</p>

            <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-slate-500">{tags.map((item)=>` #${item}`)}</div>

                <div className="flex items-center gap-2">
                    <MdCreate className={"icon-btn hover:text-green-600"}
                              onClick={onEdit}/>
                    <MdDelete className={"icon-btn hover:text-red-500"}
                              onClick={onDelete}/>
                </div>
            </div>
            {/*<AddEditNotes/>*/}

        </div>
    )
}
export default NoteCard