require('dotenv').config();

const mongoose = require('mongoose');
mongoose.connect(process.env.VITE_MONGO_URI);

// PERCENT ENCODING FOR PASSWORD

const express = require('express');
const cors = require('cors');
const app = express();

const jwt = require('jsonwebtoken');
const {authenticateToken} = require('./utilities');


app.use(express.json());

app.use(cors({
    origin: "*",    // allows requests from any origin
}));

app.get('/', (req, res) => {
    res.json({
        data:"hello"
    })
})

const User = require('./models/user.model.js')
const Note = require('./models/note.model.js')

//CREATE ACCOUNT
app.post("/create-account", async(req, res) => {
    const { fullName , email ,password } = req.body;

    if(!fullName){
        return res.status(400).json({error:true , message: "Full Name Required"})
    }
    if(!email){
        return res.status(400).json({error:true , message: "Email Required"})
    }
    if(!password){
        return res.status(400).json({error:true , message: "Password Required"})
    }

    const isUser = await User.findOne({email: email})
    if(isUser){
        return res.json({error:true , message:"User already exists"})
    }

    const user = new User({
        fullName,
        email,
        password,
    })

    await user.save();

    const accessToken = jwt.sign({user} , process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '36000m'
    });
    return res.json({
        error:false,
        user,
        accessToken,
        message: "Registration Successful",
    })

})

// LOGIN
app.post("/login", async(req, res) => {
    const { email, password } = req.body;

    if(!email){
        return res.status(400).json({error:true , message: "Email Required"})
    }

    if(!password){
        return res.status(400).json({error:true , message: "Password Required"})
    }

    const userInfo = await User.findOne({email: email})

    if(!userInfo){
        res.status(400).json({
            error:true ,
            message:"User Doesn't exist"
        })
    }

    if(userInfo.email === email && userInfo.password === password){
        const user = {user:userInfo};
        const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: '36000m'
        })
        return res.json({
            error:false,
            message:"Login Successful",
            email,
            accessToken
        })
    } else {
        return res.status(400).json({
            error:true ,
            message:"Invalid Credentials"
        })
    }

})

// GET USER
app.get("/get-user",authenticateToken, async(req, res) => {
    const {user} = req.user;

    const isUser = await User.findOne({
        _id: user?._id
    })
    if(!isUser){
        return res.status(404).json({error:true , message:"User not found"})
    }
    return res.json({
        user:{
            fullName: isUser.fullName,
            email:isUser.email,
            _id:user._id,
            createdAt:isUser.createdAt},
        message:""
    })
})

// ADD NOTE
app.post("/add-note", authenticateToken,async(req,res) =>{
    const {title, content, tags} = req.body;
    const {user} = req.user;
    if(!title){
        return res.status(400).json({error:true , message:"Title Required"})
    }
    if(!content){
        return res.status(400).json({error:true , message:"Content Required"})
    }
    if(!tags){
        return res.status(400).json({error:true , message:"Tags Required"})
    }
    try{
        const note = new Note({
            title,
            content,
            tags: tags || [],
            userId: user._id,
        })
        await note.save();

        return res.json({
            error: false,
            note,
            message:"Note added successfully"
        })
    }catch(err){
        return res.status(500).json({
            error:true,
            message:"Internal Server Error"
        })
    }
})

// EDIT NOTE
app.put("/edit-note/:noteId", authenticateToken ,async (req,res) =>{
    const noteId = req.params.noteId;
    const {title , content , tags, isPinned} = req.body;
    const {user} = req.user;

    if(!title || !content || !tags ){
        return res.status(400).json({error:true , message:"No Changes Provided"})
    }

    try {
        const note = await Note.findOne({
            _id: noteId,
            userId: user._id,
        })

        if(!note){
            return res.status(400).json({error:true , message:"Note Not Found"})
        }

        if(title) note.title = title;
        if(content) note.content = content;
        if(tags) note.tags = tags;
        if(isPinned) note.isPinned = isPinned;

        await note.save();

        return res.json({
            error: false,
            note,
            message: "Note Updated Successfully"
        })
    }catch (e){
        return res.status(500).json({
            error:true,
            message: "Internal Server Error"
        })
    }
})

// GET ALL NOTES
app.get('/get-all-notes',authenticateToken,async(req,res) =>{
    const {user} = req.user;
    if (!user){
        return res.status(400).json({error:true , message:"No User Found"})
    }
    try{
        const notes = await Note.find({
            userId: user._id
        }).sort({
            isPinned: -1,
        })
        return res.json({
            error: false,
            notes,
            message:"All Notes Retrieved Successfully"
        })
    }catch (e){
        return res.status(500).json({
            error:true,
            message:"Internal Server Error"
        })
    }
})

// DELETE NOTE
app.delete('/delete-note/:noteId',authenticateToken,async(req,res) =>{
    const noteId = req.params.noteId;
    const {user} = req.user;
    if(!user){
        return res.status(400).json({error:true , message:"No User Found"})
    }


    try{
        const note = await Note.findOne({
            _id: noteId,
            userId: user._id,
        })
        if(!note){
            return res.status(400).json({error:true , message:"Note Not Found"})
        }
        await Note.deleteOne({
            _id: noteId,
            userId: user._id,
        });
        return res.json({
            error: false,
            message:"Note Deleted Successfully"
        })


    }catch (e) {
        res.status(500).json({
            error:true,
            message:"Internal Server Error"
        })
    }

})

// UPDATE IS PINNED VALUE
app.put('/update-note-pinned/:noteId',authenticateToken,async(req,res) =>{
    const {user} = req.user;
    const {isPinned} = req.body;
    const noteId = req.params.noteId;
    try{
        const note = await Note.findOne({
            _id: noteId,
            userId: user._id,
        })
        if(!note){
            res.status(400).json({error:true , message:"Note Not Found"})
        }

        note.isPinned = isPinned ;
        await note.save();
        return res.json({
            error: false,
            note,
            message:"isPinned Updated Successfully"
        })
    }catch (e){
        return res.status(500).json({
            error:true,
            message:"Internal Server Error"
        })
    }
})


app.use(cors({
    origin: 'https://notes-app-23xt.vercel.app',  // Allow requests from Vercel frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // If using cookies or sessions
}));
// SEARCH NOTES
app.get('/search-notes', authenticateToken, async (req, res) => {
    const { user } = req.user;
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: true, message: "Search query is required" });
    }

    try {
        const matchingNotes = await Note.find({
            userId: user._id,
            $or: [
                { title: { $regex: new RegExp(query, "i") } },  // Case-insensitive title match
                { content: { $regex: new RegExp(query, "i") } },  // Case-insensitive content match
            ],
        });

        return res.json({
            error: false,
            notes: matchingNotes.length > 0 ? matchingNotes : [],
            message: matchingNotes.length > 0
                ? "Notes matching the search query retrieved successfully"
                : "No matching notes found"
        });

    } catch (error) {
        console.error("Search Notes Error:", error); // Logs the error for debugging
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});




const port = process.env.PORT || 8000;
app.listen(port)

module.exports = app;