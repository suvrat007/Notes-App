import ProfileInfo from "./ProfileInfo.jsx";
import SearchBar from "./SearchBar.jsx";
import { useState } from "react";


const NavBar = ({ userInfo, onSearchNotes, handleClearSearch }) => {
    const [searchQuery, setSearchQuery] = useState("");

    const onClearSearch = () => {
        setSearchQuery("");
        handleClearSearch();
    };

    const handleSearch = () => {
        if (searchQuery) {
            onSearchNotes(searchQuery);
        }
    };

    return (
        <div className="bg-white flex items-center justify-between px-6 py-2 drop-shadow">
            <h2 className="text-xl font-medium text-black py-2">Notes</h2>

            <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                onClearSearch={onClearSearch}
                handleSearch={handleSearch} //
            />

            <ProfileInfo userInfo={userInfo} />
        </div>
    );
};

export default NavBar;
