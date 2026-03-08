import User from "../models/user.js";
import Seller from "../models/seller.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const login = async (req , res) => {
   try {
     const {email , password} = req.body;
     const user = await User.findOne({email}).populate("sellerId");
     if(!user){
        return res.status(404).json({success: false, error: "User not found"})
     }
     
     // Check if user is active
     if (!user.isActive) {
       return res.status(403).json({
         success: false,
         error: "Your account has been deactivated. Please contact admin."
       });
     }
     
     // Check if assigned seller is active
     if (user.role !== "admin" && user.sellerId) {
       const sellerId = user.sellerId?._id || user.sellerId;
       const seller = await Seller.findById(sellerId);
       if (seller && !seller.isActive) {
         return res.status(403).json({
           success: false,
           error: "Your assigned seller account is inactive. Please contact admin."
         });
       }
     }
     
     const isMatch = await bcrypt.compare(password, user.password)
     if(!isMatch){
        return res.status(404).json({success: false, error: "Wrong Password"})
     }
     
     const token = jwt.sign({_id: user._id , role: user.role},
     process.env.JWT_KEY , {expiresIn: "10d"}
     );

    // Build user response with seller info
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      sellerId: user.sellerId ? {
        _id: user.sellerId._id,
        sellerBusinessName: user.sellerId.sellerBusinessName,
        sellerNTNCNIC: user.sellerId.sellerNTNCNIC,
        sellerProvince: user.sellerId.sellerProvince,
        sellerAddress: user.sellerId.sellerAddress,
        fbrToken: user.sellerId.fbrToken,
        isActive: user.sellerId.isActive
      } : null
    };

    res.status(200).json({success: true, token , user: userResponse})

   } catch (error) {
    res.status(500).json({success: false, error: error.message})
   }
}

const verify = (req , res) => {
   // Build user response with seller info
   const user = req.user;
   const userResponse = {
     _id: user._id,
     name: user.name,
     email: user.email,
     role: user.role,
     isActive: user.isActive,
     sellerId: user.sellerId ? {
       _id: user.sellerId._id,
       sellerBusinessName: user.sellerId.sellerBusinessName,
       sellerNTNCNIC: user.sellerId.sellerNTNCNIC,
       sellerProvince: user.sellerId.sellerProvince,
       sellerAddress: user.sellerId.sellerAddress,
       fbrToken: user.sellerId.fbrToken,
       isActive: user.sellerId.isActive
     } : null
   };
   
   return res.status(200).json({success : true , user: userResponse});
}

export {login , verify};
